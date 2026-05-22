'use client';

import { useMemo, useState } from 'react';
import AddToCartButton from '@/components/AddToCartButton';
import BuyNowButton from '@/components/BuyNowButton';
import { formatVariantSelectionLabel, type ProductSizeType } from '@/lib/product-variants';

type Variant = {
  id: string;
  sizeType: string;
  sizeLabel: string | null;
  waist: string | null;
  length: string | null;
  quantity: number;
  isAvailable: boolean;
};

type Props = {
  product: {
    id: string;
    title: string;
    priceCents: number;
    imageUrl: string;
    shippingCents: number;
    shippingMode?: string | null;
    pickupAvailable: boolean;
    pickupCity: string | null;
    pickupState: string | null;
    inventory: number;
  };
  variants: Variant[];
};

function normalizeSizeType(sizeType: string | null | undefined): ProductSizeType | null {
  const normalized = sizeType?.trim().toLowerCase();
  if (!normalized) return null;
  if (['baby', 'clothing', 'shoes', 'pants', 'dress', 'custom'].includes(normalized)) {
    return normalized as ProductSizeType;
  }
  return null;
}

export default function ProductPurchasePanel({ product, variants }: Props) {
  const sizeType = normalizeSizeType(variants[0]?.sizeType);
  const hasVariants = variants.length > 0 && !!sizeType;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedWaist, setSelectedWaist] = useState<string | null>(null);
  const [selectedLength, setSelectedLength] = useState<string | null>(null);

  const normalizedVariants = useMemo(() => (
    variants.map((variant) => ({
      ...variant,
      sizeType: normalizeSizeType(variant.sizeType),
    }))
  ), [variants]);

  const selectedVariant = useMemo(() => {
    if (!hasVariants || !sizeType) return null;
    if (sizeType === 'pants') {
      return normalizedVariants.find((variant) => (
        variant.sizeType === 'pants'
        && variant.waist === selectedWaist
        && variant.length === selectedLength
        && variant.isAvailable
        && variant.quantity > 0
      )) ?? null;
    }
    return normalizedVariants.find((variant) => (
      variant.id === selectedVariantId
      && variant.isAvailable
      && variant.quantity > 0
    )) ?? null;
  }, [hasVariants, normalizedVariants, selectedLength, selectedVariantId, selectedWaist, sizeType]);

  const waistOptions = useMemo(() => (
    Array.from(new Set(
      normalizedVariants
        .filter((variant) => variant.sizeType === 'pants')
        .map((variant) => variant.waist)
        .filter((value): value is string => Boolean(value)),
    ))
  ), [normalizedVariants]);

  const lengthOptions = useMemo(() => (
    Array.from(new Set(
      normalizedVariants
        .filter((variant) => variant.sizeType === 'pants')
        .map((variant) => variant.length)
        .filter((value): value is string => Boolean(value)),
    ))
  ), [normalizedVariants]);

  const selectionLabel = (() => {
    if (!hasVariants || !sizeType) return null;
    if (sizeType === 'pants') {
      return (
        <p className="text-sm font-semibold text-slate-800">
          Waist: {selectedWaist ?? 'Please select'} / Length: {selectedLength ?? 'Please select'}
        </p>
      );
    }
    return (
      <p className="text-sm font-semibold text-slate-800">
        Size: {selectedVariant ? formatVariantSelectionLabel(selectedVariant) : 'Please select'}
      </p>
    );
  })();

  const selectedItemPayload = {
    id: product.id,
    title: product.title,
    priceCents: product.priceCents,
    imageUrl: product.imageUrl,
    shippingCents: product.shippingCents,
    shippingMode: product.shippingMode ?? undefined,
    pickupAvailable: product.pickupAvailable,
    pickupCity: product.pickupCity ?? undefined,
    pickupState: product.pickupState ?? undefined,
    inventoryQty: product.inventory,
    productVariantId: selectedVariant?.id,
    sizeType: selectedVariant?.sizeType ?? undefined,
    sizeLabel: selectedVariant?.sizeLabel ?? undefined,
    waist: selectedVariant?.waist ?? undefined,
    length: selectedVariant?.length ?? undefined,
  };

  const renderVariantButton = (
    label: string,
    selected: boolean,
    disabled: boolean,
    onClick: () => void,
    key: string,
  ) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`relative rounded-md border px-3 py-2 text-sm transition ${
        selected
          ? 'border-slate-900 bg-slate-900 text-white'
          : disabled
            ? 'border-slate-200 bg-slate-100 text-slate-400'
            : 'border-slate-300 bg-white text-slate-800 hover:border-slate-500'
      }`}
    >
      {label}
      {disabled && <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_46%,#94a3b8_47%,#94a3b8_53%,transparent_54%)]" />}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {hasVariants && selectionLabel}

      {hasVariants && sizeType === 'pants' && (
        <div className="space-y-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Waist</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {waistOptions.map((waist) => {
                const available = normalizedVariants.some((variant) => (
                  variant.sizeType === 'pants'
                  && variant.waist === waist
                  && (!selectedLength || variant.length === selectedLength)
                  && variant.isAvailable
                  && variant.quantity > 0
                ));
                return renderVariantButton(
                  waist,
                  selectedWaist === waist,
                  !available,
                  () => setSelectedWaist(waist),
                  `waist-${waist}`,
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Length</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {lengthOptions.map((length) => {
                const available = normalizedVariants.some((variant) => (
                  variant.sizeType === 'pants'
                  && variant.length === length
                  && (!selectedWaist || variant.waist === selectedWaist)
                  && variant.isAvailable
                  && variant.quantity > 0
                ));
                return renderVariantButton(
                  length,
                  selectedLength === length,
                  !available,
                  () => setSelectedLength(length),
                  `length-${length}`,
                );
              })}
            </div>
          </div>
        </div>
      )}

      {hasVariants && sizeType !== 'pants' && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {normalizedVariants.map((variant) => {
            const label = variant.sizeLabel ?? 'Size';
            const isAvailable = variant.isAvailable && variant.quantity > 0;
            return renderVariantButton(
              label,
              selectedVariantId === variant.id,
              !isAvailable,
              () => setSelectedVariantId(variant.id),
              variant.id,
            );
          })}
        </div>
      )}

      {product.inventory > 0 && (
        <>
          <AddToCartButton
            item={selectedItemPayload}
            requireVariantSelection={hasVariants}
          />
          <BuyNowButton
            productId={product.id}
            checkoutItem={selectedItemPayload}
            requireVariantSelection={hasVariants}
          />
          {product.pickupAvailable && (
            <BuyNowButton
              productId={product.id}
              isPickup
              checkoutItem={selectedItemPayload}
              requireVariantSelection={hasVariants}
            />
          )}
        </>
      )}
    </div>
  );
}
