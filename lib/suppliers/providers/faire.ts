import type { SupplierProviderAdapter } from '@/lib/suppliers/providers/types';
import { getSupplierCredentials } from '@/lib/suppliers/config';
import { withSupplierRetry } from '@/lib/suppliers/retry';
import { normalizeFaireProduct } from '@/lib/suppliers/mappers/faire';
import { SupplierIntegrationError } from '@/lib/suppliers/errors';

const FAIRE_PRODUCTS_ENDPOINT = 'https://www.faire.com/api/v1/products';

async function faireRequest(path: string) {
  const credentials = getSupplierCredentials('FAIRE');
  return withSupplierRetry(async () => {
    const response = await fetch(path, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${credentials.FAIRE_API_KEY}`,
      },
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new SupplierIntegrationError(
        'SUPPLIER_REQUEST_FAILED',
        typeof payload?.message === 'string' ? payload.message : 'Faire request failed.',
        'FAIRE',
        'fetchProducts',
      );
    }
    return payload;
  }, { provider: 'FAIRE', operation: 'fetchProducts' });
}

export const faireAdapter: SupplierProviderAdapter = {
  provider: 'FAIRE',
  async fetchProducts() {
    const payload = await faireRequest(FAIRE_PRODUCTS_ENDPOINT);
    const data = Array.isArray(payload?.products) ? payload.products : [];
    return data
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeFaireProduct)
      .filter((item) => item.externalProductId && item.title);
  },
};
