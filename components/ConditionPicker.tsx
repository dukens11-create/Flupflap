"use client";
import { useEffect, useRef, useState } from 'react';
import { getConditionsForSlug } from '@/lib/conditions';

interface Props {
  defaultCondition?: string;
  defaultSlug?: string;
  required?: boolean;
  /** When provided, overrides internal condition state (controlled mode). */
  externalValue?: string;
  /** Called when the user manually changes the condition. */
  onConditionChange?: (value: string) => void;
}

/**
 * A dynamic condition dropdown for the seller listing form.
 *
 * It listens for the `ff:category-change` custom event dispatched by
 * CategoryPicker and updates the available condition options to match
 * the selected category.  When no category is selected the general
 * eBay-style condition list is shown.
 *
 * On initial category load (when CategoryPicker fetches and fires the first
 * event) the server-saved `defaultCondition` is preserved even if it is not
 * in the category-specific list.  On subsequent user-driven category changes
 * the condition resets only when the current value is no longer available.
 */
export default function ConditionPicker({ defaultCondition, defaultSlug, required, externalValue, onConditionChange }: Props) {
  const [conditions, setConditions] = useState<string[]>(() => {
    const base = getConditionsForSlug(defaultSlug);
    // Ensure the server-saved condition is always present in the initial list
    if (defaultCondition && !base.includes(defaultCondition)) {
      return [...base, defaultCondition];
    }
    return base;
  });
  const [value, setValue] = useState(defaultCondition ?? '');
  // Keep a ref to the current value so the event handler can read it without
  // needing to be re-registered on every value change.
  const valueRef = useRef(value);
  // Track whether the initial category-load event has been handled yet.
  // CategoryPicker fires ff:category-change once after async category data loads.
  // We preserve the server-saved condition on that first event so it does not
  // get cleared simply because the category-specific list differs from general.
  const isInitialCategoryEventRef = useRef(true);

  // Sync external value when parent sets it (e.g. AI autofill).
  useEffect(() => {
    if (externalValue === undefined) return;
    valueRef.current = externalValue;
    setValue(externalValue);
    // If the value isn't already in the list, add it so the select renders it.
    setConditions((prev) =>
      externalValue && !prev.includes(externalValue) ? [...prev, externalValue] : prev,
    );
  }, [externalValue]);

  useEffect(() => {
    function handleCategoryChange(e: Event) {
      const slug = (e as CustomEvent<{ slug: string }>).detail?.slug ?? '';
      const next = getConditionsForSlug(slug);

      if (isInitialCategoryEventRef.current) {
        isInitialCategoryEventRef.current = false;
        // Initial load: keep the server-saved condition and add it to the
        // options list if it is not in the category-specific set.
        const currentVal = valueRef.current;
        if (currentVal && !next.includes(currentVal)) {
          setConditions([...next, currentVal]);
        } else {
          setConditions(next);
        }
        // Do NOT reset the selected value on the initial load.
        return;
      }

      setConditions(next);
      // Keep the selected value only if it is still in the new list.
      setValue(prev => {
        const newVal = next.includes(prev) ? prev : '';
        valueRef.current = newVal;
        return newVal;
      });
    }

    window.addEventListener('ff:category-change', handleCategoryChange);
    return () => window.removeEventListener('ff:category-change', handleCategoryChange);
  }, []);

  return (
    <div>
      <label className="label">
        Condition {required && <span className="text-red-500">*</span>}
      </label>
      <select
        name="condition"
        className="input"
        value={value}
        onChange={e => {
          const next = e.target.value;
          valueRef.current = next;
          setValue(next);
          onConditionChange?.(next);
        }}
        required={required}
      >
        <option value="">Select…</option>
        {conditions.map(c => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </div>
  );
}
