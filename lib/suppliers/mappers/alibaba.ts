import type { SupplierProductDTO } from '@/lib/suppliers/types';

function parseInventory(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.trunc(numeric));
}

function parsePriceCents(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric * 100));
}

export function normalizeAlibabaProduct(raw: Record<string, unknown>): SupplierProductDTO {
  const inventory = parseInventory(raw.inventory ?? raw.stockAmount ?? raw.amountOnSale);
  const title = typeof raw.subject === 'string' ? raw.subject : String(raw.title ?? '').trim();

  return {
    provider: 'ALIBABA',
    externalProductId: String(raw.productId ?? raw.id ?? '').trim(),
    sku: typeof raw.skuId === 'string' ? raw.skuId : (typeof raw.sku === 'string' ? raw.sku : null),
    title,
    description: typeof raw.description === 'string' ? raw.description : null,
    priceCents: parsePriceCents(raw.price ?? raw.retailPrice),
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'USD',
    inventory,
    available: inventory === null ? true : inventory > 0,
    rawPayload: raw,
  };
}
