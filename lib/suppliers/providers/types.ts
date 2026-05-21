import type { SupplierProvider } from '@prisma/client';
import type {
  SupplierOrderSubmissionDTO,
  SupplierOrderSubmissionResult,
  SupplierProductDTO,
} from '@/lib/suppliers/types';

export interface SupplierProviderAdapter {
  provider: SupplierProvider;
  fetchProducts(): Promise<SupplierProductDTO[]>;
  submitOrder?(input: SupplierOrderSubmissionDTO): Promise<SupplierOrderSubmissionResult>;
}
