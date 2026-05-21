import type { SupplierProvider } from '@prisma/client';

export type SupplierProductDTO = {
  provider: SupplierProvider;
  externalProductId: string;
  sku: string | null;
  title: string;
  description: string | null;
  priceCents: number | null;
  currency: string | null;
  inventory: number | null;
  available: boolean;
  rawPayload: Record<string, unknown>;
};

export type SupplierOrderLineDTO = {
  externalProductId: string;
  quantity: number;
};

export type SupplierOrderSubmissionDTO = {
  platformOrderId: string;
  routingId: string;
  lines: SupplierOrderLineDTO[];
  shippingAddress?: {
    name?: string | null;
    line1?: string | null;
    line2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  };
};

export type SupplierOrderSubmissionResult = {
  supplierOrderId: string;
  responsePayload?: Record<string, unknown> | null;
};
