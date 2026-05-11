export const SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE = 'Shipping package details are required.';
export const SHIPPING_DISTANCE_UNIT = 'in' as const;
export const SHIPPING_PACKAGE_FALLBACK = {
  weight: 1,
  weightUnit: 'lb' as const,
  weightOz: 16,
  lengthIn: 8,
  widthIn: 6,
  heightIn: 4,
};

export type WeightUnit = 'lb' | 'oz';

type PackageDetailsInput = {
  title?: string | null;
  weightOz?: number | null;
  weightUnit?: string | null;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  packageType?: string | null;
  productAttributes?: unknown;
};

function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function normalizeWeightUnit(value: string | null | undefined): WeightUnit {
  return value?.trim().toLowerCase() === 'oz' ? 'oz' : 'lb';
}

/** Converts a submitted package weight to ounces so stored product data stays normalized. */
export function convertWeightToOunces(weight: number, weightUnit: WeightUnit): number {
  return weightUnit === 'lb' ? weight * 16 : weight;
}

/** Formats package numbers for display by trimming unnecessary trailing zeros (e.g. 1.50 → "1.5", 2.00 → "2"). */
export function formatPackageNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  const formatted = value.toFixed(2);
  return formatted.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function hasStoredPackageDetails(product: PackageDetailsInput): boolean {
  return (
    isPositiveNumber(product.weightOz)
    && isPositiveNumber(product.lengthIn)
    && isPositiveNumber(product.widthIn)
    && isPositiveNumber(product.heightIn)
  );
}

export function getMissingPackageProductTitles(products: PackageDetailsInput[]): string[] {
  return products
    .filter((product) => !hasStoredPackageDetails(product))
    .map((product) => product.title?.trim())
    .filter((title): title is string => !!title);
}

export function getShippingClass(productAttributes: unknown): string | null {
  if (!productAttributes || typeof productAttributes !== 'object' || Array.isArray(productAttributes)) {
    return null;
  }
  const shippingClass = (productAttributes as Record<string, unknown>).shippingClass;
  if (typeof shippingClass !== 'string') return null;
  const trimmed = shippingClass.trim();
  return trimmed || null;
}

export function setShippingClass(
  productAttributes: unknown,
  shippingClass: string | null | undefined,
): Record<string, unknown> | undefined {
  const nextAttributes =
    productAttributes && typeof productAttributes === 'object' && !Array.isArray(productAttributes)
      ? { ...(productAttributes as Record<string, unknown>) }
      : {};

  const trimmedShippingClass = shippingClass?.trim() || '';
  if (trimmedShippingClass) {
    nextAttributes.shippingClass = trimmedShippingClass;
  } else {
    delete nextAttributes.shippingClass;
  }

  return Object.keys(nextAttributes).length ? nextAttributes : undefined;
}

export function getEffectivePackageDetails(
  product: PackageDetailsInput,
  options: { useFallback?: boolean } = {},
) {
  const { useFallback = true } = options;
  const weightUnit = normalizeWeightUnit(product.weightUnit);
  const weightOz = isPositiveNumber(product.weightOz)
    ? product.weightOz
    : (useFallback ? SHIPPING_PACKAGE_FALLBACK.weightOz : null);
  const lengthIn = isPositiveNumber(product.lengthIn)
    ? product.lengthIn
    : (useFallback ? SHIPPING_PACKAGE_FALLBACK.lengthIn : null);
  const widthIn = isPositiveNumber(product.widthIn)
    ? product.widthIn
    : (useFallback ? SHIPPING_PACKAGE_FALLBACK.widthIn : null);
  const heightIn = isPositiveNumber(product.heightIn)
    ? product.heightIn
    : (useFallback ? SHIPPING_PACKAGE_FALLBACK.heightIn : null);

  if (!weightOz || !lengthIn || !widthIn || !heightIn) {
    return null;
  }

  const weight = weightUnit === 'lb' ? weightOz / 16 : weightOz;

  return {
    weight,
    weightOz,
    weightUnit,
    lengthIn,
    widthIn,
    heightIn,
    distanceUnit: SHIPPING_DISTANCE_UNIT,
    packageType: product.packageType?.trim() || null,
    shippingClass: getShippingClass(product.productAttributes),
  };
}

export function formatPackageDisplay(
  packageDetails: NonNullable<ReturnType<typeof getEffectivePackageDetails>>,
  includeFallbackNotice = false,
) {
  const dimensions = `${formatPackageNumber(packageDetails.lengthIn)} × ${formatPackageNumber(packageDetails.widthIn)} × ${formatPackageNumber(packageDetails.heightIn)} in`;
  const fallbackNotice = includeFallbackNotice
    ? ' · fallback defaults shown until you save real package details'
    : '';
  return `Package: ${formatPackageNumber(packageDetails.weight)} ${packageDetails.weightUnit} · ${dimensions}${fallbackNotice}`;
}
