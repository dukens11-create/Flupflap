import type { SupplierProductDTO } from '@/lib/suppliers/types';

function centsFromDollars(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.round(numeric * 100));
}

export function normalizeFaireProduct(raw: Record<string, unknown>): SupplierProductDTO {
  const inventory = Number.isFinite(Number(raw.available_quantity))
    ? Math.max(0, Math.trunc(Number(raw.available_quantity)))
    : null;

  return {
    provider: 'FAIRE',
    externalProductId: String(raw.id ?? raw.product_id ?? '').trim(),
    sku: typeof raw.sku === 'string' ? raw.sku : null,
    title: String(raw.name ?? raw.title ?? '').trim(),
    description: typeof raw.description === 'string' ? raw.description : null,
    priceCents: centsFromDollars(raw.wholesale_price ?? raw.price),
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'USD',
    inventory,
    available: inventory === null ? Boolean(raw.active ?? true) : inventory > 0,
    rawPayload: raw,
  };
}
