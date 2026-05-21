import type { SupplierProviderAdapter } from '@/lib/suppliers/providers/types';
import { getSupplierCredentials } from '@/lib/suppliers/config';
import { withSupplierRetry } from '@/lib/suppliers/retry';
import { normalizeAlibabaProduct } from '@/lib/suppliers/mappers/alibaba';
import { SupplierIntegrationError } from '@/lib/suppliers/errors';

const ALIBABA_PRODUCTS_ENDPOINT = 'https://gw.open.1688.com/openapi/param2/1/system/currentTime';

async function alibabaRequest(path: string) {
  const credentials = getSupplierCredentials('ALIBABA');
  return withSupplierRetry(async () => {
    const response = await fetch(path, {
      method: 'GET',
      headers: {
        'x-app-key': credentials.ALIBABA_APP_KEY,
        'x-app-secret': credentials.ALIBABA_APP_SECRET,
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new SupplierIntegrationError(
        'SUPPLIER_REQUEST_FAILED',
        typeof payload?.message === 'string' ? payload.message : 'Alibaba request failed.',
        'ALIBABA',
        'fetchProducts',
      );
    }
    return payload;
  }, { provider: 'ALIBABA', operation: 'fetchProducts' });
}

export const alibabaAdapter: SupplierProviderAdapter = {
  provider: 'ALIBABA',
  async fetchProducts() {
    const payload = await alibabaRequest(ALIBABA_PRODUCTS_ENDPOINT);
    const entries = Array.isArray(payload?.products)
      ? payload.products
      : (Array.isArray(payload?.result) ? payload.result : []);
    return entries
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeAlibabaProduct)
      .filter((item) => item.externalProductId && item.title);
  },
};
