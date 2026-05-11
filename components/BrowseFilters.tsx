"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useTransition, useState } from 'react';
import { useI18n } from '@/components/I18nProvider';
import { ALL_CONDITIONS } from '@/lib/conditions';

interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  aliases?: string[];
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  children: CategoryNode[];
}

const CONDITIONS = ALL_CONDITIONS;

function findNodeById(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const childMatch = findNodeById(node.children, id);
    if (childMatch) return childMatch;
  }
  return null;
}

export default function BrowseFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '');
  const [categories, setCategories] = useState<CategoryNode[]>([]);

  // Fetch categories once
  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: CategoryNode[]) => setCategories(data))
      .catch(() => {/* ignore */});
  }, []);

  // Single updater used for all filter fields
  const updateSearchParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      params.delete('page');
      startTransition(() => router.push(`/?${params.toString()}`));
    },
    [router, searchParams]
  );

  useEffect(() => {
    setSearchValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  // When main category changes, clear subcategory and attribute filters
  const handleCategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('category', value);
    else params.delete('category');
    params.delete('subcategory');
    params.delete('refineCategory');
    params.delete('brand');
    params.delete('size');
    params.delete('color');
    params.delete('gender');
    params.delete('page');
    startTransition(() => router.push(`/?${params.toString()}`));
  };

  const handleSubcategoryChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('subcategory', value);
    else params.delete('subcategory');
    params.delete('refineCategory');
    params.delete('page');
    startTransition(() => router.push(`/?${params.toString()}`));
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set('q', value);
    else params.delete('q');
    params.delete('page');
    startTransition(() => router.replace(`/?${params.toString()}`));
  };

  const clear = () => {
    setSearchValue('');
    startTransition(() => router.push('/'));
  };

  const hasFilters = searchParams.toString().length > 0;

  const selectedCategoryId = searchParams.get('category') ?? '';
  const rawSelectedSubcategoryId = searchParams.get('subcategory') ?? '';
  const rawSelectedRefineCategoryId = searchParams.get('refineCategory') ?? '';

  // Find selected main category node
  const selectedMainNode = selectedCategoryId
    ? categories.find(c => c.id === selectedCategoryId) ?? null
    : null;

  const rawSelectedSubcategoryNode = rawSelectedSubcategoryId
    ? findNodeById(categories, rawSelectedSubcategoryId)
    : null;
  const usesLegacyLeafSubcategoryParam = Boolean(
    selectedCategoryId &&
    rawSelectedSubcategoryNode &&
    !rawSelectedRefineCategoryId &&
    rawSelectedSubcategoryNode.parentId &&
    rawSelectedSubcategoryNode.parentId !== selectedCategoryId
  );

  const selectedSubcategoryId = usesLegacyLeafSubcategoryParam
    ? rawSelectedSubcategoryNode?.parentId ?? ''
    : rawSelectedSubcategoryId;
  const selectedRefineCategoryId = usesLegacyLeafSubcategoryParam
    ? rawSelectedSubcategoryId
    : rawSelectedRefineCategoryId;

  const subcategories = selectedMainNode?.children ?? [];
  const selectedSubcategoryNode = selectedSubcategoryId
    ? findNodeById(categories, selectedSubcategoryId)
    : null;
  const refineCategories = selectedSubcategoryNode?.children ?? [];

  return (
    <div className={`mb-6 rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm transition-opacity sm:p-5${isPending ? ' opacity-60' : ''}`}>
      {/* Row 1: Search + Main filters */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-7">
        <div className="col-span-full lg:col-span-2">
          <input
            className="input"
            placeholder={t('filters.searchPlaceholder')}
            value={searchValue}
            onChange={e => handleSearchChange(e.target.value)}
          />
        </div>
        {/* Main category */}
        <select
          className="input col-span-1"
          value={selectedCategoryId}
          onChange={e => handleCategoryChange(e.target.value)}
        >
          <option value="">{t('filters.allCategories')}</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}{c.name}
            </option>
          ))}
        </select>
        {/* Subcategory or condition filter depending on context */}
        {subcategories.length > 0 ? (
          <select
            className="input col-span-1"
            value={selectedSubcategoryId}
            onChange={e => handleSubcategoryChange(e.target.value)}
          >
            <option value="">All subcategories</option>
            {subcategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ) : (
          <select
            className="input col-span-1"
            value={searchParams.get('condition') ?? ''}
            onChange={e => updateSearchParam('condition', e.target.value)}
          >
            <option value="">{t('filters.anyCondition')}</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{t(`filters.conditions.${c}`)}</option>)}
          </select>
        )}
        {refineCategories.length > 0 && (
          <select
            className="input col-span-1"
            value={selectedRefineCategoryId}
            onChange={e => updateSearchParam('refineCategory', e.target.value)}
          >
            <option value="">All refine categories</option>
            {refineCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {subcategories.length > 0 && refineCategories.length === 0 && (
          <select
            className="input col-span-1"
            value={searchParams.get('condition') ?? ''}
            onChange={e => updateSearchParam('condition', e.target.value)}
          >
            <option value="">{t('filters.anyCondition')}</option>
            {CONDITIONS.map(c => <option key={c} value={c}>{t(`filters.conditions.${c}`)}</option>)}
          </select>
        )}
        <input
          className="input col-span-1"
          type="number"
          placeholder={t('filters.minPrice')}
          min="0"
          defaultValue={searchParams.get('minPrice') ?? ''}
          onBlur={e => updateSearchParam('minPrice', e.target.value)}
        />
        <input
          className="input col-span-1"
          type="number"
          placeholder={t('filters.maxPrice')}
          min="0"
          defaultValue={searchParams.get('maxPrice') ?? ''}
          onBlur={e => updateSearchParam('maxPrice', e.target.value)}
        />
      </div>

      {/* Row 2: eBay-style attribute filters — only shown when a category is selected */}
      {selectedCategoryId && (
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Condition filter (when row 1 subcategory slot is taken by subcategory picker) */}
          {refineCategories.length > 0 && (
            <select
              className="input col-span-1"
              value={searchParams.get('condition') ?? ''}
              onChange={e => updateSearchParam('condition', e.target.value)}
            >
              <option value="">{t('filters.anyCondition')}</option>
              {CONDITIONS.map(c => <option key={c} value={c}>{t(`filters.conditions.${c}`)}</option>)}
            </select>
          )}
          {/* Brand */}
          <input
            className="input col-span-1"
            type="text"
            placeholder="Brand"
            defaultValue={searchParams.get('brand') ?? ''}
            onBlur={e => updateSearchParam('brand', e.target.value)}
          />
          {/* Size */}
          <input
            className="input col-span-1"
            type="text"
            placeholder="Size"
            defaultValue={searchParams.get('size') ?? ''}
            onBlur={e => updateSearchParam('size', e.target.value)}
          />
          {/* Color */}
          <input
            className="input col-span-1"
            type="text"
            placeholder="Color"
            defaultValue={searchParams.get('color') ?? ''}
            onBlur={e => updateSearchParam('color', e.target.value)}
          />
          {/* Gender */}
          <select
            className="input col-span-1"
            value={searchParams.get('gender') ?? ''}
            onChange={e => updateSearchParam('gender', e.target.value)}
          >
            <option value="">Any gender</option>
            {['Men', 'Women', 'Kids', 'Unisex'].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          {/* Shipping */}
          <select
            className="input col-span-1"
            value={searchParams.get('shipping') ?? ''}
            onChange={e => updateSearchParam('shipping', e.target.value)}
          >
            <option value="">Any shipping</option>
            <option value="free">Free shipping</option>
            <option value="paid">Paid shipping</option>
          </select>
          {/* Local pickup */}
          <label className="col-span-1 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={searchParams.get('pickup') === '1'}
              onChange={e => updateSearchParam('pickup', e.target.checked ? '1' : '')}
            />
            <span className="text-sm text-slate-700">Local pickup</span>
          </label>
        </div>
      )}

      {hasFilters && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button className="btn-outline text-sm" onClick={clear}>{t('filters.clearFilters')}</button>
        </div>
      )}
    </div>
  );
}
