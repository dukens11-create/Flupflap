export type ProductSizeType = 'baby' | 'clothing' | 'shoes' | 'pants' | 'dress' | 'custom';

export type ProductVariantInput = {
  sizeType: ProductSizeType;
  sizeLabel?: string | null;
  waist?: string | null;
  length?: string | null;
  quantity: number;
  isAvailable: boolean;
};

export type ProductVariantDraft = ProductVariantInput & { id?: string };

export const PRODUCT_SIZE_FORMATS: Array<{ value: ProductSizeType; label: string }> = [
  { value: 'baby', label: 'Baby' },
  { value: 'clothing', label: 'Clothing' },
  { value: 'shoes', label: 'Shoes' },
  { value: 'pants', label: 'Pants/Jeans' },
  { value: 'dress', label: 'Dress' },
  { value: 'custom', label: 'Custom' },
];

export const PRESET_SIZE_OPTIONS: Record<Exclude<ProductSizeType, 'custom' | 'pants'>, string[]> = {
  baby: ['3 months', '6 months', '9 months', '12 months', '18 months', '24 months'],
  clothing: ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL'],
  shoes: ['7', '7.5', '8', '8.5', '9', '10', '11', '12'],
  dress: ['2', '4', '6', '8', '10', '12', '14', '16', '18'],
};

export const PANTS_WAIST_OPTIONS = ['28', '30', '32', '34', '36', '38', '40'];
export const PANTS_LENGTH_OPTIONS = ['28', '30', '32', '34', '36'];

const VALID_SIZE_TYPES = new Set<ProductSizeType>(['baby', 'clothing', 'shoes', 'pants', 'dress', 'custom']);

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeProductVariantsInput(value: unknown): {
  variants: ProductVariantDraft[];
  sizeType: ProductSizeType | null;
  error: string | null;
} {
  if (value === undefined || value === null || value === '') {
    return { variants: [], sizeType: null, error: null };
  }

  let rawValue: unknown = value;
  if (typeof value === 'string') {
    try {
      rawValue = JSON.parse(value);
    } catch {
      return { variants: [], sizeType: null, error: 'Invalid size variants payload.' };
    }
  }

  if (!Array.isArray(rawValue)) {
    return { variants: [], sizeType: null, error: 'Invalid size variants payload.' };
  }

  const normalized: ProductVariantDraft[] = [];
  const keys = new Set<string>();
  let resolvedType: ProductSizeType | null = null;

  for (const entry of rawValue) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const sizeTypeRaw = cleanText(item.sizeType)?.toLowerCase() as ProductSizeType | undefined;
    if (!sizeTypeRaw || !VALID_SIZE_TYPES.has(sizeTypeRaw)) {
      return { variants: [], sizeType: null, error: 'Invalid size format was submitted.' };
    }
    if (!resolvedType) {
      resolvedType = sizeTypeRaw;
    } else if (resolvedType !== sizeTypeRaw) {
      return { variants: [], sizeType: null, error: 'All size variants must use the same size format.' };
    }

    const quantityNumber = Number(item.quantity);
    const quantity = Number.isInteger(quantityNumber) && quantityNumber >= 0 ? quantityNumber : 0;
    const explicitAvailability = item.isAvailable === true || item.isAvailable === 'true';
    const sizeLabel = cleanText(item.sizeLabel);
    const waist = cleanText(item.waist);
    const length = cleanText(item.length);

    if (sizeTypeRaw === 'pants') {
      if (!waist || !length) {
        return { variants: [], sizeType: null, error: 'Pants variants must include waist and length.' };
      }
    } else if (!sizeLabel) {
      return { variants: [], sizeType: null, error: 'Each selected size must include a label.' };
    }

    const key = sizeTypeRaw === 'pants' ? `pants:${waist}:${length}` : `size:${sizeLabel}`;
    if (keys.has(key)) continue;
    keys.add(key);

    normalized.push({
      id: cleanText(item.id) ?? undefined,
      sizeType: sizeTypeRaw,
      sizeLabel,
      waist,
      length,
      quantity,
      isAvailable: explicitAvailability && quantity > 0,
    });
  }

  return { variants: normalized, sizeType: resolvedType, error: null };
}

export function getAvailableVariantInventory(variants: Array<Pick<ProductVariantInput, 'quantity' | 'isAvailable'>>): number {
  return variants.reduce((sum, variant) => (
    variant.isAvailable && variant.quantity > 0 ? sum + variant.quantity : sum
  ), 0);
}

export function formatVariantSelectionLabel(variant: {
  sizeLabel?: string | null;
  waist?: string | null;
  length?: string | null;
}): string {
  if (variant.waist && variant.length) {
    return `Waist ${variant.waist} / Length ${variant.length}`;
  }
  return variant.sizeLabel?.trim() || 'Size selected';
}
