import type { Prisma, SupplierProvider, SupplierSyncOperation } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getSupplierSecretEnvKeys } from '@/lib/suppliers/config';
import { redactSecrets, logError } from '@/lib/logger';

const SENSITIVE_CONTEXT_KEYS = [
  'authorization',
  'apiKey',
  'apiSecret',
  'token',
  ...getSupplierSecretEnvKeys(),
];

function redactContext(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(redactContext);
  }
  if (!input || typeof input !== 'object') return input;

  const source = input as Record<string, unknown>;
  const normalized = Object.keys(source).reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = redactContext(source[key]);
    return acc;
  }, {});

  const keysToRedact = Object.keys(normalized).filter((key) =>
    SENSITIVE_CONTEXT_KEYS.some((secretKey) => secretKey.toLowerCase() === key.toLowerCase()),
  );
  return redactSecrets(normalized, keysToRedact);
}

export type SupplierErrorLogParams = {
  provider: SupplierProvider;
  operation: SupplierSyncOperation;
  error: unknown;
  requestContext?: Record<string, unknown>;
  syncRunId?: string;
  orderRoutingId?: string;
};

export async function persistSupplierErrorLog(params: SupplierErrorLogParams) {
  const safeContextObject = (redactContext(params.requestContext ?? {}) ?? {}) as Record<string, unknown>;
  const safeContext = safeContextObject as Prisma.InputJsonValue;
  const code = (params.error as { code?: unknown })?.code;
  const errorCode = typeof code === 'string' ? code : null;
  const errorMessage = params.error instanceof Error ? params.error.message : String(params.error);

  await prisma.supplierIntegrationErrorLog.create({
    data: {
      provider: params.provider,
      operation: params.operation,
      requestContext: safeContext,
      errorCode,
      errorMessage,
      syncRunId: params.syncRunId ?? null,
      orderRoutingId: params.orderRoutingId ?? null,
    },
  });

  logError('Supplier integration operation failed', params.error, {
    tag: 'suppliers/error-log',
    provider: params.provider,
    operation: params.operation,
    ...safeContextObject,
  });
}
