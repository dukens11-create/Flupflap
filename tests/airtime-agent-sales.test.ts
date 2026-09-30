import assert from 'node:assert/strict';
import test from 'node:test';
import { createAirtimeSaleHandler, settleAirtimeProviderResult } from '../lib/airtime-agent-sales';

// Transactional test double: isolated writes, rollback, unique keys and serialized
// conditional updates. No real provider or database connection is made.
function fixture(options: { balance?: number; status?: string; currency?: string } = {}) {
  let state: { profiles: Record<string, any>; sales: Record<string, any>; ledger: any[] } = {
    profiles: Object.fromEntries(['one', 'two'].map(id => [id, {
      id, sellerId: id, status: options.status ?? 'ACTIVE', currency: options.currency ?? 'USD',
      walletBalanceCents: options.balance ?? 2000, commissionBps: 300,
      lifetimeSalesCents: 0, lifetimeCommissionCents: 0,
    }])), sales: {}, ledger: [],
  };
  let tail = Promise.resolve();
  const faults = { counter: 0, refundLedger: 0, afterReservation: false };
  let submissions = 0;
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]: [string, any]) =>
    value && typeof value === 'object' ? ('gte' in value ? row[key] >= value.gte : value.in.includes(row[key])) : row[key] === value);
  function apply(row: any, data: any) {
    for (const [key, value] of Object.entries(data) as [string, any][]) {
      if (value === undefined) continue;
      row[key] = value && typeof value === 'object' && 'increment' in value ? row[key] + value.increment :
        value && typeof value === 'object' && 'decrement' in value ? row[key] - value.decrement : structuredClone(value);
    }
    return structuredClone(row);
  }
  function delegates(read: () => typeof state) {
    const model = (rows: () => Record<string, any>, isProfile = false) => ({
      async findUnique({ where }: any) { return structuredClone(Object.values(rows()).find(row => matches(row, where)) ?? null); },
      async findUniqueOrThrow(args: any) { const row = await this.findUnique(args); if (!row) throw new Error('Missing row'); return row; },
      async updateMany({ where, data }: any) {
        const targets = Object.values(rows()).filter(row => matches(row, where));
        for (const row of targets) apply(row, data);
        return { count: targets.length };
      },
      async update({ where, data }: any) {
        if (isProfile && data.lifetimeSalesCents && faults.counter-- > 0) throw new Error('Injected counter failure');
        const row = Object.values(rows()).find(row => matches(row, where));
        if (!row) throw new Error('Missing row');
        return apply(row, data);
      },
      async create({ data }: any) {
        if (Object.values(rows()).some(row => row.idempotencyKey === data.idempotencyKey)) {
          throw Object.assign(new Error('Duplicate'), { code: 'P2002' });
        }
        const row = { id: `sale-${Object.keys(rows()).length + 1}`, status: 'PENDING', providerTransactionId: null, ...data };
        rows()[row.id] = structuredClone(row);
        return structuredClone(row);
      },
    });
    return {
      airtimeSale: model(() => read().sales),
      airtimeAgentProfile: model(() => read().profiles, true),
      airtimeAgentLedgerEntry: { async create({ data }: any) {
        if (data.type === 'REFUND' && faults.refundLedger-- > 0) throw new Error('Injected ledger failure');
        read().ledger.push(structuredClone(data)); return data;
      } },
    };
  }
  const db = {
    ...delegates(() => state),
    $transaction<T>(callback: (tx: any) => Promise<T>) {
      const run = tail.then(async () => {
        if (faults.afterReservation && Object.keys(state.sales).length) throw new Error('Database unavailable');
        const staged = structuredClone(state);
        const value = await callback(delegates(() => staged));
        state = staged;
        return value;
      });
      tail = run.then(() => undefined, () => undefined);
      return run;
    },
  } as unknown as Parameters<typeof createAirtimeSaleHandler>[0]['db'];
  function handler(submit: (input: any) => Promise<unknown> = async () => ({ transactionId: 1001, status: 'SUCCESSFUL' }),
    user: { id: string; role: string } | null = { id: 'one', role: 'SELLER' }) {
    return createAirtimeSaleHandler({ db, session: async () => user ? { user } : null,
      submit: async input => { submissions++; return submit(input); }, accountCurrency: () => 'USD' });
  }
  return { db, handler, faults, state: () => state, submissions: () => submissions };
}

function request(key: string | null = 'sale-request-001', overrides = {}) {
  return new Request('https://example.test/api/airtime-agent/sales', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(key == null ? {} : { 'Idempotency-Key': key }) },
    body: JSON.stringify({ operatorId: 10, amountCents: 1000, recipientCountryCode: 'HT', recipientPhone: '+50937050210', ...overrides }),
  });
}
const provider = (status: string) => ({ transactionId: 1001, status });
const refunds = (f: ReturnType<typeof fixture>) => f.state().ledger.filter(row => row.type === 'REFUND');
const sales = (f: ReturnType<typeof fixture>) => Object.values(f.state().sales);

test('production HTTP handler rejects unauthenticated and non-seller requests', async () => {
  const f = fixture();
  for (const user of [null, { id: 'one', role: 'BUYER' }, { id: 'one', role: 'ADMIN' }]) {
    assert.equal((await f.handler(undefined, user)(request())).status, 403);
  }
  assert.equal(f.submissions(), 0); assert.equal(sales(f).length, 0);
});
test('inactive agent cannot reserve funds or submit airtime', async () => {
  const f = fixture({ status: 'SUSPENDED' });
  assert.equal((await f.handler()(request())).status, 403); assert.equal(f.submissions(), 0);
});
test('insufficient balance rejects without a debit', async () => {
  const f = fixture({ balance: 969 });
  assert.equal((await f.handler()(request())).status, 409);
  assert.equal(f.state().profiles.one.walletBalanceCents, 969); assert.equal(f.submissions(), 0);
});
test('missing/invalid idempotency keys and invalid amounts fail before reservation', async () => {
  const f = fixture();
  for (const key of [null, 'short', 'bad key spaces']) assert.equal((await f.handler()(request(key))).status, 400);
  for (const amountCents of [0, -1, 1.5, 2147483648]) assert.equal((await f.handler()(request(undefined, { amountCents }))).status, 400);
  assert.equal(f.submissions(), 0);
});
test('wallet currency must match the configured account currency', async () => {
  const f = fixture({ currency: 'EUR' });
  assert.equal((await f.handler()(request())).status, 409); assert.equal(f.submissions(), 0);
});
test('confirmed success settles once and a replay returns the existing sale', async () => {
  const f = fixture(); const post = f.handler();
  const first = await (await post(request())).json();
  const replay = await (await post(request())).json();
  assert.equal(first.sale.status, 'SUCCESSFUL'); assert.equal(replay.sale.id, first.sale.id); assert.equal(replay.duplicate, true);
  await Promise.all(Array.from({ length: 3 }, () => settleAirtimeProviderResult(f.db, first.sale.id, provider('SUCCESSFUL'))));
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030);
  assert.equal(f.state().profiles.one.lifetimeSalesCents, 1000);
  assert.equal(f.state().profiles.one.lifetimeCommissionCents, 30);
  assert.equal(f.state().ledger.length, 1); assert.equal(f.submissions(), 1);
});
test('simultaneous same-key requests debit and submit only once', async () => {
  const f = fixture(); const post = f.handler();
  const responses = await Promise.all([post(request()), post(request())]);
  assert.deepEqual(responses.map(r => r.status), [200, 200]);
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030);
  assert.equal(sales(f).length, 1); assert.equal(f.state().ledger.length, 1); assert.equal(f.submissions(), 1);
});
test('two simultaneous sales cannot spend the same wallet balance', async () => {
  const f = fixture({ balance: 970 }); const post = f.handler();
  const responses = await Promise.all([post(request('sale-request-001')), post(request('sale-request-002'))]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(f.state().profiles.one.walletBalanceCents, 0); assert.equal(f.submissions(), 1);
  assert.equal(f.state().ledger.length, 1);
});
test('confirmed failure refunds once, including concurrent settlement and request replay', async () => {
  const f = fixture(); const post = f.handler(async () => provider('FAILED'));
  const response = await post(request()); assert.equal(response.status, 502);
  const { sale } = await response.json();
  assert.equal(sale.status, 'FAILED');
  await Promise.all(Array.from({ length: 3 }, () => settleAirtimeProviderResult(f.db, sale.id, provider('FAILED'))));
  await post(request());
  assert.equal(f.state().profiles.one.walletBalanceCents, 2000); assert.equal(refunds(f).length, 1);
  assert.equal(f.state().profiles.one.lifetimeSalesCents, 0); assert.equal(f.state().profiles.one.lifetimeCommissionCents, 0);
  assert.equal(f.submissions(), 1);
});
test('pending keeps debit reserved and does not settle commission', async () => {
  const f = fixture(); const response = await f.handler(async () => provider('PROCESSING'))(request());
  assert.equal(response.status, 202); assert.equal((await response.json()).sale.status, 'PENDING');
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0);
  assert.equal(f.state().profiles.one.lifetimeCommissionCents, 0);
});
for (const code of ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'HTTP_503', 'INVALID_JSON']) {
  test(`${code} remains UNKNOWN, preserves references and never refunds or resubmits`, async () => {
    const f = fixture(); const post = f.handler(async () => { throw Object.assign(new Error('Simulated provider error'), { code }); });
    const response = await post(request()); const { sale } = await response.json();
    assert.equal(response.status, 202); assert.equal(sale.status, 'UNKNOWN');
    assert.equal(sale.idempotencyKey, 'sale-request-001'); assert.match(sale.externalReference, /^flupflap-/);
    assert.equal(sale.failureCode, 'PROVIDER_REQUEST_UNCERTAIN');
    await post(request());
    assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0); assert.equal(f.submissions(), 1);
  });
}
for (const result of [null, {}, { status: 'SUCCESSFUL' }, provider('surprise'), { transactionId: 1001 }]) {
  test(`malformed/unknown provider response ${JSON.stringify(result)} stays unresolved`, async () => {
    const f = fixture(); const response = await f.handler(async () => result)(request());
    assert.equal(response.status, 202); assert.equal((await response.json()).sale.status, 'UNKNOWN');
    assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0);
  });
}
test('database error after provider success rolls back settlement and never refunds', async () => {
  const f = fixture(); f.faults.counter = 1;
  const response = await f.handler()(request()); const { sale } = await response.json();
  assert.equal(response.status, 202); assert.equal(sale.status, 'UNKNOWN'); assert.equal(sale.providerTransactionId, '1001');
  assert.equal(sale.failureCode, 'LOCAL_SETTLEMENT_ERROR');
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0);
  assert.equal(f.state().profiles.one.lifetimeSalesCents, 0);
  await settleAirtimeProviderResult(f.db, sale.id, provider('SUCCESSFUL'));
  assert.equal(f.state().profiles.one.lifetimeSalesCents, 1000); assert.equal(f.state().profiles.one.lifetimeCommissionCents, 30);
});
test('HTTP exception payload is diagnostic only, preserving its ID without authorizing a refund', async () => {
  const f = fixture();
  const response = await f.handler(async () => {
    throw Object.assign(new Error('Upstream error'), { payload: provider('FAILED') });
  })(request());
  const { sale } = await response.json();
  assert.equal(sale.status, 'UNKNOWN'); assert.equal(sale.providerTransactionId, '1001');
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0);
});
test('failed refund ledger write rolls back the credit, then verified failure can settle once', async () => {
  const f = fixture(); f.faults.refundLedger = 1;
  const { sale } = await (await f.handler(async () => provider('FAILED'))(request())).json();
  assert.equal(sale.status, 'UNKNOWN'); assert.equal(f.state().profiles.one.walletBalanceCents, 1030);
  assert.equal(refunds(f).length, 0);
  await settleAirtimeProviderResult(f.db, sale.id, provider('FAILED'));
  await settleAirtimeProviderResult(f.db, sale.id, provider('FAILED'));
  assert.equal(f.state().profiles.one.walletBalanceCents, 2000); assert.equal(refunds(f).length, 1);
});
test('database outage after submission leaves durable PENDING reservation and reports reconciliation required', async () => {
  const f = fixture(); f.faults.afterReservation = true;
  const response = await f.handler()(request());
  assert.equal(response.status, 503); assert.equal((await response.json()).code, 'AIRTIME_RECONCILIATION_REQUIRED');
  assert.equal(sales(f)[0].status, 'PENDING'); assert.equal(f.state().profiles.one.walletBalanceCents, 1030);
  assert.equal(refunds(f).length, 0);
});
test('seller cannot replay another seller key, including a concurrent unique-key conflict', async () => {
  const f = fixture();
  const one = f.handler(); const two = f.handler(undefined, { id: 'two', role: 'SELLER' });
  const responses = await Promise.all([one(request()), two(request())]);
  assert.deepEqual(responses.map(r => r.status), [200, 409]);
  assert.equal((await two(request())).status, 409);
  assert.equal(f.state().profiles.two.walletBalanceCents, 2000); assert.equal(f.submissions(), 1);
});
test('same seller cannot reuse a key with changed sale details', async () => {
  const f = fixture(); const post = f.handler(); await post(request());
  assert.equal((await post(request(undefined, { amountCents: 1200 }))).status, 409);
  assert.equal(f.submissions(), 1);
});
test('verified settlement can resolve UNKNOWN/PENDING without allowing contradictory terminal results', async () => {
  for (const initial of ['PROCESSING', 'unknown']) {
    for (const final of ['SUCCESSFUL', 'FAILED']) {
      const f = fixture(); const { sale } = await (await f.handler(async () => provider(initial))(request())).json();
      await Promise.all([settleAirtimeProviderResult(f.db, sale.id, provider(final)), settleAirtimeProviderResult(f.db, sale.id, provider(final))]);
      await settleAirtimeProviderResult(f.db, sale.id, provider(final === 'FAILED' ? 'SUCCESSFUL' : 'FAILED'));
      assert.equal(sales(f)[0].status, final);
      assert.equal(f.state().profiles.one.walletBalanceCents, final === 'FAILED' ? 2000 : 1030);
      assert.equal(f.state().profiles.one.lifetimeSalesCents, final === 'SUCCESSFUL' ? 1000 : 0);
      assert.equal(refunds(f).length, final === 'FAILED' ? 1 : 0);
    }
  }
});
test('mismatched provider transaction/reference cannot settle or replace a bound ID', async () => {
  const f = fixture(); const { sale } = await (await f.handler(async () => provider('PROCESSING'))(request())).json();
  await settleAirtimeProviderResult(f.db, sale.id, { transactionId: 2002, status: 'FAILED' });
  await settleAirtimeProviderResult(f.db, sale.id, { ...provider('FAILED'), customIdentifier: 'another-sale' });
  assert.equal(sales(f)[0].status, 'UNKNOWN'); assert.equal(sales(f)[0].providerTransactionId, '1001');
  assert.equal(f.state().profiles.one.walletBalanceCents, 1030); assert.equal(refunds(f).length, 0);
});
