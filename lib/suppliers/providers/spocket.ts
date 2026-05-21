import type { SupplierProviderAdapter } from '@/lib/suppliers/providers/types';
import { getSupplierCredentials } from '@/lib/suppliers/config';

/**
 * Spocket scaffold adapter.
 * Kept intentionally minimal until API credentials + endpoint contract are enabled.
 */
export const spocketAdapter: SupplierProviderAdapter = {
  provider: 'SPOCKET',
  async fetchProducts() {
    getSupplierCredentials('SPOCKET');
    return [];
  },
};
