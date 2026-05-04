"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useTransition, useState } from 'react';

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Sports', 'Collectibles', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Used', 'For Parts'];

export default function BrowseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      startTransition(() => router.push(`/?${params.toString()}`));
    },
    [router, searchParams]
  );

  // Debounced search so we don't navigate on every keystroke
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      update('q', searchValue);
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  const clear = () => {
    setSearchValue('');
    startTransition(() => router.push('/'));
  };

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className={`flex flex-wrap gap-3 mb-6 p-4 card${isPending ? ' opacity-60' : ''}`}>
      <input
        className="input max-w-xs"
        placeholder="Search products…"
        value={searchValue}
        onChange={e => setSearchValue(e.target.value)}
      />
      <select
        className="input w-40"
        value={searchParams.get('category') ?? ''}
        onChange={e => update('category', e.target.value)}
      >
        <option value="">All categories</option>
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <select
        className="input w-36"
        value={searchParams.get('condition') ?? ''}
        onChange={e => update('condition', e.target.value)}
      >
        <option value="">Any condition</option>
        {CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <input
        className="input w-28"
        type="number"
        placeholder="Min $"
        min="0"
        defaultValue={searchParams.get('minPrice') ?? ''}
        onBlur={e => update('minPrice', e.target.value)}
      />
      <input
        className="input w-28"
        type="number"
        placeholder="Max $"
        min="0"
        defaultValue={searchParams.get('maxPrice') ?? ''}
        onBlur={e => update('maxPrice', e.target.value)}
      />
      {hasFilters && (
        <button className="btn-outline" onClick={clear}>Clear filters</button>
      )}
    </div>
  );
}
