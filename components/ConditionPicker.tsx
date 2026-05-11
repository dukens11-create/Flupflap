"use client";
import { useEffect, useState } from 'react';
import { getConditionsForSlug } from '@/lib/conditions';

interface Props {
  defaultCondition?: string;
  defaultSlug?: string;
  required?: boolean;
}

/**
 * A dynamic condition dropdown for the seller listing form.
 *
 * It listens for the `ff:category-change` custom event dispatched by
 * CategoryPicker and updates the available condition options to match
 * the selected category.  When no category is selected the general
 * eBay-style condition list is shown.
 */
export default function ConditionPicker({ defaultCondition, defaultSlug, required }: Props) {
  const [conditions, setConditions] = useState<string[]>(
    () => getConditionsForSlug(defaultSlug),
  );
  const [value, setValue] = useState(defaultCondition ?? '');

  useEffect(() => {
    // Seed with the initial slug (used on the edit page where we know the category upfront).
    if (defaultSlug) {
      setConditions(getConditionsForSlug(defaultSlug));
    }
  }, [defaultSlug]);

  useEffect(() => {
    function handleCategoryChange(e: Event) {
      const slug = (e as CustomEvent<{ slug: string }>).detail?.slug ?? '';
      const next = getConditionsForSlug(slug);
      setConditions(next);
      // Keep the selected value only if it is still in the new list.
      setValue(prev => (next.includes(prev) ? prev : ''));
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
        onChange={e => setValue(e.target.value)}
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
