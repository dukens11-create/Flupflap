"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useTransition, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Sports', 'Collectibles', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Used', 'For Parts'];

export default function BrowseFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '');
  const [locationValue, setLocationValue] = useState(searchParams.get('location') ?? '');
  const [minPriceValue, setMinPriceValue] = useState(searchParams.get('minPrice') ?? '');
  const [maxPriceValue, setMaxPriceValue] = useState(searchParams.get('maxPrice') ?? '');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    setSearchValue(searchParams.get('q') ?? '');
    setLocationValue(searchParams.get('location') ?? '');
    setMinPriceValue(searchParams.get('minPrice') ?? '');
    setMaxPriceValue(searchParams.get('maxPrice') ?? '');
  }, [searchParams]);

  const updateSearchParam = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        const trimmedValue = value.trim();
        if (trimmedValue) params.set(key, trimmedValue);
        else params.delete(key);
      });
      params.delete('page');
      const next = params.toString();
      startTransition(() => router.push(next ? `/?${next}` : '/'));
    },
    [router, searchParams]
  );

  useEffect(() => {
    const id = setTimeout(() => {
      updateSearchParam({ q: searchValue });
    }, 350);
    return () => clearTimeout(id);
  }, [searchValue, updateSearchParam]);

  useEffect(() => {
    const id = setTimeout(() => {
      updateSearchParam({ location: locationValue });
    }, 350);
    return () => clearTimeout(id);
  }, [locationValue, updateSearchParam]);

  useEffect(() => {
    const query = searchValue.trim();
    if (!query) {
      setSuggestions([]);
      return;
    }

    const controller = new AbortController();
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/products/suggestions?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setSuggestions([]);
          return;
        }

        const nextSuggestions = await res.json();
        setSuggestions(Array.isArray(nextSuggestions) ? nextSuggestions : []);
      } catch {
        if (!controller.signal.aborted) {
          setSuggestions([]);
        }
      }
    }, 150);

    return () => {
      controller.abort();
      clearTimeout(id);
    };
  }, [searchValue]);

  const applyPriceFilters = useCallback(() => {
    updateSearchParam({ minPrice: minPriceValue, maxPrice: maxPriceValue });
  }, [maxPriceValue, minPriceValue, updateSearchParam]);

  const clear = () => {
    setSearchValue('');
    setLocationValue('');
    setMinPriceValue('');
    setMaxPriceValue('');
    setSuggestions([]);
    startTransition(() => router.push('/'));
  };

  const handlePriceInputKeyDown = (key: string) => {
    if (key === 'Enter') applyPriceFilters();
  };

  const hasFilters = searchParams.toString().length > 0;

  return (
    <div className={`mb-6 p-4 card${isPending ? ' opacity-60' : ''}`}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <input
          className="input md:col-span-2 xl:col-span-2"
          placeholder={t('filters.searchPlaceholder')}
          value={searchValue}
          list="browse-search-suggestions"
          onChange={e => setSearchValue(e.target.value)}
        />
        <select
          className="input"
          value={searchParams.get('category') ?? ''}
          onChange={e => updateSearchParam({ category: e.target.value })}
        >
          <option value="">{t('filters.allCategories')}</option>
          {CATEGORIES.map(c => <option key={c} value={c}>{t(`filters.categories.${c}`)}</option>)}
        </select>
        <select
          className="input"
          value={searchParams.get('condition') ?? ''}
          onChange={e => updateSearchParam({ condition: e.target.value })}
        >
          <option value="">{t('filters.anyCondition')}</option>
          {CONDITIONS.map(c => <option key={c} value={c}>{t(`filters.conditions.${c}`)}</option>)}
        </select>
        <select
          className="input"
          value={searchParams.get('sort') ?? 'newest'}
          onChange={e => updateSearchParam({ sort: e.target.value })}
        >
          <option value="newest">{t('filters.sortNewest')}</option>
          <option value="popular">{t('filters.sortPopular')}</option>
        </select>
        <input
          className="input md:col-span-2"
          placeholder={t('filters.location')}
          value={locationValue}
          onChange={e => setLocationValue(e.target.value)}
        />
        <input
          className="input"
          type="number"
          placeholder={t('filters.minPrice')}
          min="0"
          value={minPriceValue}
          onChange={e => setMinPriceValue(e.target.value)}
          onBlur={applyPriceFilters}
          onKeyDown={e => handlePriceInputKeyDown(e.key)}
        />
        <input
          className="input"
          type="number"
          placeholder={t('filters.maxPrice')}
          min="0"
          value={maxPriceValue}
          onChange={e => setMaxPriceValue(e.target.value)}
          onBlur={applyPriceFilters}
          onKeyDown={e => handlePriceInputKeyDown(e.key)}
        />
        {hasFilters && (
          <button className="btn-outline" onClick={clear}>{t('filters.clearFilters')}</button>
        )}
      </div>
      {suggestions.length > 0 && (
        <datalist id="browse-search-suggestions">
          {suggestions.map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
        </datalist>
      )}
    </div>
  );
}
