import type { SupplierProductDTO } from '@/lib/suppliers/types';

function toInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.trunc(parsed));
}

export function normalizeCjProduct(raw: Record<string, unknown>): SupplierProductDTO {
  const inventory = toInteger(raw.stockNum ?? raw.inventory ?? raw.stock);
  const priceCents = toInteger(Number(raw.sellPrice ?? raw.price ?? 0) * 100);

  return {
    provider: 'CJ',
    externalProductId: String(raw.pid ?? raw.id ?? '').trim(),
    sku: typeof raw.productSku === 'string' ? raw.productSku : (typeof raw.sku === 'string' ? raw.sku : null),
    title: String(raw.productNameEn ?? raw.name ?? raw.title ?? '').trim(),
    description: typeof raw.description === 'string' ? raw.description : null,
    priceCents,
    currency: typeof raw.currency === 'string' ? raw.currency.toUpperCase() : 'USD',
    inventory,
    available: inventory === null ? true : inventory > 0,
    rawPayload: raw,
  };
}
