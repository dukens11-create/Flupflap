import test from 'node:test';
import assert from 'node:assert/strict';
import { getSupplierCredentials } from '@/lib/suppliers/config';
import { SupplierConfigError } from '@/lib/suppliers/errors';
import { redactSecrets } from '@/lib/logger';
import { normalizeCjProduct } from '@/lib/suppliers/mappers/cj';
import { normalizeFaireProduct } from '@/lib/suppliers/mappers/faire';
import { normalizeAlibabaProduct } from '@/lib/suppliers/mappers/alibaba';

function withEnv(overrides: Record<string, string | undefined>, run: () => void) {
  const previous = Object.fromEntries(
    Object.keys(overrides).map((key) => [key, process.env[key]]),
  );
  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  });
  try {
    run();
  } finally {
    Object.entries(previous).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  }
}

test('supplier config throws clear error when required keys are missing', () => {
  withEnv({ CJ_API_KEY: '', CJ_API_SECRET: undefined }, () => {
    assert.throws(() => getSupplierCredentials('CJ'), (error) => {
      assert.ok(error instanceof SupplierConfigError);
      assert.equal(error.code, 'MISSING_SUPPLIER_CREDENTIALS');
      assert.equal(error.provider, 'CJ');
      assert.deepEqual(error.missingKeys, ['CJ_API_KEY', 'CJ_API_SECRET']);
      return true;
    });
  });
});

test('supplier config returns server credentials when env is present', () => {
  withEnv({ FAIRE_API_KEY: 'faire-secret' }, () => {
    const credentials = getSupplierCredentials('FAIRE');
    assert.equal(credentials.FAIRE_API_KEY, 'faire-secret');
  });
});

test('redactSecrets masks case-insensitive key matches', () => {
  const output = redactSecrets(
    { Authorization: 'Bearer secret-token', token: 'abc', keep: 'ok' },
    ['authorization', 'TOKEN'],
  );
  assert.equal(output.Authorization, '[REDACTED]');
  assert.equal(output.token, '[REDACTED]');
  assert.equal(output.keep, 'ok');
});

test('CJ mapper normalizes to shared supplier DTO', () => {
  const normalized = normalizeCjProduct({
    pid: 'cj-123',
    productNameEn: 'CJ Lamp',
    productSku: 'sku-cj',
    sellPrice: 12.34,
    stockNum: 9,
  });
  assert.equal(normalized.provider, 'CJ');
  assert.equal(normalized.externalProductId, 'cj-123');
  assert.equal(normalized.priceCents, 1234);
  assert.equal(normalized.inventory, 9);
});

test('Faire mapper normalizes to shared supplier DTO', () => {
  const normalized = normalizeFaireProduct({
    id: 'faire-123',
    name: 'Faire Vase',
    sku: 'faire-sku',
    wholesale_price: 20,
    available_quantity: 2,
  });
  assert.equal(normalized.provider, 'FAIRE');
  assert.equal(normalized.externalProductId, 'faire-123');
  assert.equal(normalized.priceCents, 2000);
  assert.equal(normalized.available, true);
});

test('Alibaba mapper normalizes to shared supplier DTO', () => {
  const normalized = normalizeAlibabaProduct({
    productId: 'ali-123',
    subject: 'Alibaba Chair',
    skuId: 'ali-sku',
    price: 15.5,
    stockAmount: 0,
  });
  assert.equal(normalized.provider, 'ALIBABA');
  assert.equal(normalized.externalProductId, 'ali-123');
  assert.equal(normalized.priceCents, 1550);
  assert.equal(normalized.available, false);
});
