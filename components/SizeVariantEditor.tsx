'use client';

import { useMemo, useState } from 'react';
import {
  PANTS_LENGTH_OPTIONS,
  PANTS_WAIST_OPTIONS,
  PRESET_SIZE_OPTIONS,
  PRODUCT_SIZE_FORMATS,
  type ProductSizeType,
  type ProductVariantDraft,
} from '@/lib/product-variants';

type Props = {
  inputName?: string;
  defaultVariants?: ProductVariantDraft[];
  defaultSizeType?: ProductSizeType | null;
};

function getInitialType(defaultType: ProductSizeType | null | undefined, defaultVariants: ProductVariantDraft[]) {
  if (defaultType) return defaultType;
  return defaultVariants[0]?.sizeType ?? null;
}

function getInitialCustomSizes(defaultVariants: ProductVariantDraft[]) {
  return defaultVariants
    .filter((variant) => variant.sizeType === 'custom')
    .map((variant) => variant.sizeLabel?.trim())
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function getVariantKey(variant: Pick<ProductVariantDraft, 'sizeType' | 'sizeLabel' | 'waist' | 'length'>) {
  return variant.sizeType === 'pants'
    ? `pants:${variant.waist}:${variant.length}`
    : `size:${variant.sizeLabel}`;
}

function getVariantLabel(variant: Pick<ProductVariantDraft, 'sizeType' | 'sizeLabel' | 'waist' | 'length'>) {
  if (variant.sizeType === 'pants') {
    return `Waist ${variant.waist} / Length ${variant.length}`;
  }
  return variant.sizeLabel ?? 'Size';
}

export default function SizeVariantEditor({ inputName = 'productVariants', defaultVariants = [], defaultSizeType = null }: Props) {
  const [sizeType, setSizeType] = useState<ProductSizeType | null>(getInitialType(defaultSizeType, defaultVariants));
  const [customSizes, setCustomSizes] = useState<string>(getInitialCustomSizes(defaultVariants));
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(() => (
    new Set(defaultVariants.map((variant) => getVariantKey(variant)))
  ));
  const [variantState, setVariantState] = useState<Record<string, { quantity: number; isAvailable: boolean }>>(() => {
    const out: Record<string, { quantity: number; isAvailable: boolean }> = {};
    for (const variant of defaultVariants) {
      out[getVariantKey(variant)] = {
        quantity: Number.isInteger(variant.quantity) ? Math.max(0, variant.quantity) : 0,
        isAvailable: Boolean(variant.isAvailable),
      };
    }
    return out;
  });

  const customSizeList = useMemo(() => (
    customSizes
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  ), [customSizes]);

  const possibleVariants: ProductVariantDraft[] = useMemo(() => {
    if (!sizeType) return [];
    if (sizeType === 'pants') {
      return PANTS_WAIST_OPTIONS.flatMap((waist) => (
        PANTS_LENGTH_OPTIONS.map((length) => ({
          sizeType: 'pants' as const,
          waist,
          length,
          sizeLabel: null,
          quantity: 0,
          isAvailable: false,
        }))
      ));
    }
    if (sizeType === 'custom') {
      return customSizeList.map((sizeLabel) => ({
        sizeType: 'custom' as const,
        sizeLabel,
        waist: null,
        length: null,
        quantity: 0,
        isAvailable: false,
      }));
    }
    return PRESET_SIZE_OPTIONS[sizeType].map((sizeLabel) => ({
      sizeType,
      sizeLabel,
      waist: null,
      length: null,
      quantity: 0,
      isAvailable: false,
    }));
  }, [customSizeList, sizeType]);

  const selectedVariants = useMemo(() => {
    return possibleVariants
      .filter((variant) => enabledKeys.has(getVariantKey(variant)))
      .map((variant) => {
        const key = getVariantKey(variant);
        const state = variantState[key] ?? { quantity: 1, isAvailable: true };
        const quantity = Math.max(0, Math.min(9999, Number.isInteger(state.quantity) ? state.quantity : 0));
        const isAvailable = Boolean(state.isAvailable) && quantity > 0;
        return {
          ...variant,
          quantity,
          isAvailable,
        };
      });
  }, [enabledKeys, possibleVariants, variantState]);

  function toggleVariant(variant: ProductVariantDraft) {
    const key = getVariantKey(variant);
    setEnabledKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setVariantState((current) => {
      if (current[key]) return current;
      return {
        ...current,
        [key]: { quantity: 1, isAvailable: true },
      };
    });
  }

  function updateVariantState(key: string, next: Partial<{ quantity: number; isAvailable: boolean }>) {
    setVariantState((current) => {
      const existing = current[key] ?? { quantity: 1, isAvailable: true };
      return {
        ...current,
        [key]: {
          quantity: next.quantity ?? existing.quantity,
          isAvailable: next.isAvailable ?? existing.isAvailable,
        },
      };
    });
  }

  return (
    <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
      <legend className="text-sm font-semibold text-slate-700 px-1">Size variants (optional)</legend>
      <div>
        <label className="label">Size format</label>
        <select
          className="input"
          value={sizeType ?? ''}
          onChange={(event) => {
            const next = (event.target.value || null) as ProductSizeType | null;
            setSizeType(next);
            setEnabledKeys(new Set());
          }}
        >
          <option value="">None</option>
          {PRODUCT_SIZE_FORMATS.map((format) => (
            <option key={format.value} value={format.value}>{format.label}</option>
          ))}
        </select>
      </div>

      {sizeType === 'custom' && (
        <div>
          <label className="label">Custom sizes (comma-separated)</label>
          <input
            className="input"
            value={customSizes}
            onChange={(event) => setCustomSizes(event.target.value)}
            placeholder="e.g. Petite, Tall, One Size"
          />
        </div>
      )}

      {sizeType && possibleVariants.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-slate-500">Select offered sizes, then set quantity and out-of-stock status.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {possibleVariants.map((variant) => {
              const key = getVariantKey(variant);
              const selected = enabledKeys.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleVariant(variant)}
                  className={`rounded-lg border px-3 py-2 text-sm text-left transition ${selected ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-slate-500'}`}
                >
                  {getVariantLabel(variant)}
                </button>
              );
            })}
          </div>

          {selectedVariants.length > 0 && (
            <div className="space-y-2">
              {selectedVariants.map((variant) => {
                const key = getVariantKey(variant);
                const state = variantState[key] ?? { quantity: variant.quantity || 1, isAvailable: variant.isAvailable };
                return (
                  <div key={key} className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <p className="text-sm font-semibold text-slate-800">{getVariantLabel(variant)}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-xs text-slate-600 space-y-1">
                        <span>Stock quantity</span>
                        <input
                          type="number"
                          min={0}
                          max={9999}
                          className="input"
                          value={state.quantity}
                          onChange={(event) => updateVariantState(key, { quantity: Number(event.target.value) || 0 })}
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-700 pt-6">
                        <input
                          type="checkbox"
                          checked={!state.isAvailable}
                          onChange={(event) => updateVariantState(key, { isAvailable: !event.target.checked })}
                        />
                        Mark out of stock
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <input type="hidden" name={inputName} value={JSON.stringify(selectedVariants)} />
      <input type="hidden" name="sizeType" value={sizeType ?? ''} />
    </fieldset>
  );
}
