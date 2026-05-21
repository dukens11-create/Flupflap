import type { SupplierProvider } from '@prisma/client';
import type { SupplierProviderAdapter } from '@/lib/suppliers/providers/types';
import { cjAdapter } from '@/lib/suppliers/providers/cj';
import { faireAdapter } from '@/lib/suppliers/providers/faire';
import { alibabaAdapter } from '@/lib/suppliers/providers/alibaba';
import { spocketAdapter } from '@/lib/suppliers/providers/spocket';

const SUPPLIER_ADAPTERS: Record<SupplierProvider, SupplierProviderAdapter> = {
  CJ: cjAdapter,
  FAIRE: faireAdapter,
  ALIBABA: alibabaAdapter,
  SPOCKET: spocketAdapter,
};

export function getSupplierAdapter(provider: SupplierProvider): SupplierProviderAdapter {
  return SUPPLIER_ADAPTERS[provider];
}
