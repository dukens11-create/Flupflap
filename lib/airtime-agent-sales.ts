import { randomUUID } from 'node:crypto';
import type { AirtimeSale, PrismaClient } from '@prisma/client';
import {
  calculateAgentSaleEconomics, classifyProviderTopupStatus,
  normalizeIdempotencyKey, normalizeIso2,
} from './airtime-agent';

type Database = Pick<PrismaClient, '$transaction' | 'airtimeSale' | 'airtimeAgentProfile'>;
type SaleInput = {
  operatorId: number; amountCents: number; recipientCountryCode: string;
  recipientPhone: string; customIdentifier: string;
};
type Dependencies = {
  db: Database;
  session: () => Promise<{ user?: { id?: string; role?: string } } | null>;
  submit: (input: SaleInput) => Promise<unknown>;
  accountCurrency: () => string;
};
const unresolved = ['PENDING', 'UNKNOWN'];

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function observation(sale: AirtimeSale, response: unknown) {
  const data = object(response);
  const id = typeof data.transactionId === 'string' ? data.transactionId :
    Number.isSafeInteger(data.transactionId) ? String(data.transactionId) : '';
  const validId = /^[1-9][0-9]*$/.test(id);
  const bindingMismatch = (data.customIdentifier != null && data.customIdentifier !== sale.externalReference) ||
    (sale.providerTransactionId != null && sale.providerTransactionId !== id);
  const status = typeof data.status === 'string' ? data.status.trim().toUpperCase() : '';
  const cost = object(data.balanceInfo).cost;
  return {
    disposition: !validId || bindingMismatch ? 'UNKNOWN' as const : classifyProviderTopupStatus(status),
    // Never replace a bound transaction ID with an unrelated provider result.
    providerTransactionId: validId && !bindingMismatch ? id : undefined,
    providerCostCents: !bindingMismatch && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0 &&
      Number.isSafeInteger(Math.round(cost * 100)) && cost * 100 <= 2147483647 ? Math.round(cost * 100) : undefined,
    providerPayload: {
      status: status.slice(0, 80),
      ...(validId && !bindingMismatch ? { transactionId: id } : {}),
    },
    failureCode: bindingMismatch ? 'PROVIDER_BINDING_MISMATCH' : 'PROVIDER_OUTCOME_UNKNOWN',
  };
}

/** Internal only: accepts a response from the server's provider call, never browser input.
 * A future verified provider lookup may use this same atomic settlement path.
 */
export async function settleAirtimeProviderResult(db: Database, saleId: string, response: unknown) {
  return db.$transaction(async tx => {
    const sale = await tx.airtimeSale.findUniqueOrThrow({ where: { id: saleId } });
    if (!unresolved.includes(sale.status)) return sale;
    const result = observation(sale, response);
    const status = result.disposition === 'SUCCESS' ? 'SUCCESSFUL' :
      result.disposition === 'FAILURE' ? 'FAILED' : result.disposition;
    // This conditional write locks the sale row. Only its winner may settle funds.
    // The terminal state, wallet/counters, and ledger commit or roll back together.
    const changed = await tx.airtimeSale.updateMany({
      where: { id: sale.id, status: { in: unresolved } },
      data: {
        status,
        providerTransactionId: result.providerTransactionId,
        providerCostCents: result.providerCostCents,
        providerPayload: result.providerPayload,
        failureCode: status === 'UNKNOWN' ? result.failureCode : status === 'FAILED' ? 'PROVIDER_CONFIRMED_FAILURE' : null,
        failureMessage: status === 'UNKNOWN' ? 'Provider outcome requires reconciliation.' : null,
      },
    });
    if (changed.count === 1 && status === 'SUCCESSFUL') {
      await tx.airtimeAgentProfile.update({
        where: { id: sale.profileId },
        data: {
          lifetimeSalesCents: { increment: sale.amountCents },
          lifetimeCommissionCents: { increment: sale.commissionCents },
        },
      });
    } else if (changed.count === 1 && status === 'FAILED') {
      const profile = await tx.airtimeAgentProfile.update({
        where: { id: sale.profileId }, data: { walletBalanceCents: { increment: sale.debitCents } },
      });
      await tx.airtimeAgentLedgerEntry.create({
        data: {
          profileId: sale.profileId, type: 'REFUND', amountCents: sale.debitCents,
          balanceAfterCents: profile.walletBalanceCents, referenceId: sale.id,
          note: 'Refund after confirmed provider failure',
        },
      });
    }
    return tx.airtimeSale.findUniqueOrThrow({ where: { id: sale.id } });
  });
}

async function recordUnknown(db: Database, saleId: string, response: unknown, code: string) {
  return db.$transaction(async tx => {
    const sale = await tx.airtimeSale.findUniqueOrThrow({ where: { id: saleId } });
    const result = observation(sale, response);
    await tx.airtimeSale.updateMany({
      where: { id: saleId, status: { in: unresolved } },
      data: {
        status: 'UNKNOWN', providerTransactionId: result.providerTransactionId,
        providerPayload: result.providerPayload, failureCode: code,
        failureMessage: 'Outcome unresolved; funds reserved until authoritative reconciliation.',
      },
    });
    return tx.airtimeSale.findUniqueOrThrow({ where: { id: saleId } });
  });
}

function saleResponse(sale: AirtimeSale, duplicate = false) {
  return Response.json({ sale, ...(duplicate ? { duplicate: true } : {}) }, {
    status: duplicate || sale.status === 'SUCCESSFUL' ? 200 : sale.status === 'FAILED' ? 502 : 202,
  });
}

/** The production POST handler; dependencies are injectable for HTTP-flow tests. */
export function createAirtimeSaleHandler({ db, session: getSession, submit, accountCurrency }: Dependencies) {
  return async function POST(req: Request) {
    const session = await getSession();
    if (!session?.user?.id || session.user.role !== 'SELLER') {
      return Response.json({ error: 'Seller account required.' }, { status: 403 });
    }
    const sellerId = session.user.id;
    const body = object(await req.json().catch(() => ({})));
    const operatorId = Number(body.operatorId);
    const amountCents = Number(body.amountCents);
    const recipientCountryCode = normalizeIso2(body.recipientCountryCode);
    const recipientPhone = String(body.recipientPhone ?? '').replace(/[^0-9+]/g, '');
    const idempotencyKey = normalizeIdempotencyKey(req.headers.get('idempotency-key') ?? body.idempotencyKey);
    if (!idempotencyKey) return Response.json({ error: 'A valid idempotency key is required.' }, { status: 400 });
    if (!Number.isSafeInteger(operatorId) || operatorId <= 0 || !Number.isSafeInteger(amountCents) ||
        amountCents <= 0 || amountCents > 2147483647 || !recipientCountryCode || recipientPhone.replace(/\D/g, '').length < 7) {
      return Response.json({ error: 'Operator, amount, country, and recipient phone are required.' }, { status: 400 });
    }

    async function duplicateResponse(sale: AirtimeSale) {
      const owner = await db.airtimeAgentProfile.findUnique({ where: { id: sale.profileId } });
      // Apply the same ownership and request binding on both normal and concurrent replay.
      if (!owner || owner.sellerId !== sellerId || sale.operatorId !== operatorId ||
          sale.amountCents !== amountCents || sale.recipientCountryCode !== recipientCountryCode || sale.recipientPhone !== recipientPhone) {
        return Response.json({ error: 'Idempotency key already used.' }, { status: 409 });
      }
      return saleResponse(sale, true);
    }

    const existing = await db.airtimeSale.findUnique({ where: { idempotencyKey } });
    if (existing) return duplicateResponse(existing);
    const profile = await db.airtimeAgentProfile.findUnique({ where: { sellerId } });
    if (!profile || profile.status !== 'ACTIVE') {
      return Response.json({ error: 'Your airtime agent account must be approved before selling.' }, { status: 403 });
    }
    if (profile.currency !== accountCurrency()) {
      return Response.json({ error: 'Agent wallet currency is not enabled for live airtime sales yet.' }, { status: 409 });
    }
    const economics = calculateAgentSaleEconomics(amountCents, profile.commissionBps);
    const reference = 'flupflap-' + randomUUID();
    let reserved: AirtimeSale | null;
    try {
      reserved = await db.$transaction(async tx => {
        const changed = await tx.airtimeAgentProfile.updateMany({
          where: { id: profile.id, status: 'ACTIVE', currency: profile.currency, walletBalanceCents: { gte: economics.debitCents } },
          data: { walletBalanceCents: { decrement: economics.debitCents } },
        });
        if (changed.count !== 1) return null;
        const fresh = await tx.airtimeAgentProfile.findUniqueOrThrow({ where: { id: profile.id } });
        const sale = await tx.airtimeSale.create({ data: {
          profileId: profile.id, externalReference: reference, idempotencyKey, operatorId,
          recipientCountryCode: recipientCountryCode!, recipientPhone, amountCents,
          debitCents: economics.debitCents, commissionCents: economics.commissionCents, currency: profile.currency,
        } });
        await tx.airtimeAgentLedgerEntry.create({ data: {
          profileId: profile.id, type: 'SALE_DEBIT', amountCents: -economics.debitCents,
          balanceAfterCents: fresh.walletBalanceCents, referenceId: sale.id, note: 'Airtime sale reservation',
        } });
        return sale;
      });
    } catch (error) {
      if (object(error).code === 'P2002') {
        const duplicate = await db.airtimeSale.findUnique({ where: { idempotencyKey } });
        if (duplicate) return duplicateResponse(duplicate);
      }
      throw error;
    }
    if (!reserved) {
      const duplicate = await db.airtimeSale.findUnique({ where: { idempotencyKey } });
      if (duplicate) return duplicateResponse(duplicate);
      return Response.json({ error: 'Insufficient agent wallet balance.' }, { status: 409 });
    }

    async function unresolvedResponse(response: unknown, code: string) {
      try {
        return saleResponse(await recordUnknown(db, reserved!.id, response, code));
      } catch {
        // The durable reservation still exists if recording diagnostics also fails.
        // Never retry the purchase or credit funds on a local persistence error.
        return Response.json({ error: 'Unable to record provider outcome; funds remain reserved.',
          code: 'AIRTIME_RECONCILIATION_REQUIRED', saleId: reserved!.id }, { status: 503 });
      }
    }

    let provider: unknown;
    try {
      provider = await submit({ operatorId, amountCents, recipientCountryCode, recipientPhone, customIdentifier: reference });
    } catch (error) {
      // HTTP errors and transport failures are not authoritative failure evidence.
      return unresolvedResponse(object(error).payload, 'PROVIDER_REQUEST_UNCERTAIN');
    }
    try {
      return saleResponse(await settleAirtimeProviderResult(db, reserved.id, provider));
    } catch {
      // Distinguish a local settlement error from a provider-declared failure.
      return unresolvedResponse(provider, 'LOCAL_SETTLEMENT_ERROR');
    }
  };
}
