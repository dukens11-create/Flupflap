import type { SupplierProvider } from '@prisma/client';
import { SupplierConfigError } from '@/lib/suppliers/errors';

type SupplierCredentials = Record<string, string>;

const PROVIDER_ENV_KEYS: Record<SupplierProvider, readonly string[]> = {
  CJ: ['CJ_API_KEY', 'CJ_API_SECRET'],
  FAIRE: ['FAIRE_API_KEY'],
  ALIBABA: ['ALIBABA_APP_KEY', 'ALIBABA_APP_SECRET'],
  SPOCKET: ['SPOCKET_API_KEY'],
};

const ALL_SUPPLIER_SECRET_ENV_KEYS = [
  'CJ_API_KEY',
  'CJ_API_SECRET',
  'FAIRE_API_KEY',
  'ALIBABA_APP_KEY',
  'ALIBABA_APP_SECRET',
  'SPOCKET_API_KEY',
] as const;

if (typeof window !== 'undefined') {
  throw new Error('Supplier credentials can only be accessed in server runtime paths.');
}

export function getSupplierSecretEnvKeys(): readonly string[] {
  return ALL_SUPPLIER_SECRET_ENV_KEYS;
}

export function getSupplierCredentials(provider: SupplierProvider): SupplierCredentials {
  const keys = PROVIDER_ENV_KEYS[provider];
  const missingKeys = keys.filter((key) => !(process.env[key] ?? '').trim());
  if (missingKeys.length > 0) {
    throw new SupplierConfigError(provider, missingKeys);
  }

  return keys.reduce<SupplierCredentials>((credentials, key) => {
    credentials[key] = (process.env[key] ?? '').trim();
    return credentials;
  }, {});
}
