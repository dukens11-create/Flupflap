import type { SupplierProviderAdapter } from '@/lib/suppliers/providers/types';
import { withSupplierRetry } from '@/lib/suppliers/retry';
import { getSupplierCredentials } from '@/lib/suppliers/config';
import { normalizeCjProduct } from '@/lib/suppliers/mappers/cj';
import { SupplierIntegrationError } from '@/lib/suppliers/errors';

const CJ_PRODUCTS_ENDPOINT = 'https://developers.cjdropshipping.com/api2.0/v1/product/list';

async function cjRequest(path: string, body: Record<string, unknown>) {
  const credentials = getSupplierCredentials('CJ');
  return withSupplierRetry(async () => {
    const response = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CJ-Access-Token': credentials.CJ_API_KEY,
        'CJ-Secret': credentials.CJ_API_SECRET,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
      throw new SupplierIntegrationError(
        'SUPPLIER_REQUEST_FAILED',
        typeof payload?.message === 'string' ? payload.message : 'CJ request failed.',
        'CJ',
        'fetchProducts',
      );
    }
    return payload;
  }, { provider: 'CJ', operation: 'fetchProducts' });
}

export const cjAdapter: SupplierProviderAdapter = {
  provider: 'CJ',
  async fetchProducts() {
    const payload = await cjRequest(CJ_PRODUCTS_ENDPOINT, { pageNum: 1, pageSize: 100 });
    const items = Array.isArray(payload?.data) ? payload.data : (Array.isArray(payload?.list) ? payload.list : []);
    return items
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(normalizeCjProduct)
      .filter((item) => item.externalProductId && item.title);
  },
};
