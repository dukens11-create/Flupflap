"use client";
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';
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
  productCount: number;
  children: CategoryNode[];
}

interface FlatCategoryOption {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  level: number;
  icon: string | null;
  productCount: number;
  path: CategoryNode[];
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

function flattenCategoryOptions(
  nodes: CategoryNode[],
  parents: CategoryNode[] = [],
): FlatCategoryOption[] {
  return nodes.flatMap((node) => {
    const path = [...parents, node];
    return [
      {
        id: node.id,
        name: node.name,
        slug: node.slug,
        aliases: node.aliases ?? [],
        level: node.level,
        icon: node.icon,
        productCount: node.productCount,
        path,
      },
      ...flattenCategoryOptions(node.children, path),
    ];
  });
}

function normalizeCategorySearch(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export default function BrowseFilters() {
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(searchParams.get('q') ?? '');
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const categoryMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (!isCategoryMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!categoryMenuRef.current?.contains(event.target as Node)) {
        setIsCategoryMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCategoryMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isCategoryMenuOpen]);

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

  const categoryOptions = useMemo(() => flattenCategoryOptions(categories), [categories]);
  const selectedCategoryOption = useMemo(() => {
    const selectedId = selectedRefineCategoryId || selectedSubcategoryId || selectedCategoryId;
    return selectedId
      ? categoryOptions.find((option) => option.id === selectedId) ?? null
      : null;
  }, [categoryOptions, selectedCategoryId, selectedRefineCategoryId, selectedSubcategoryId]);

  const filteredCategoryOptions = useMemo(() => {
    const normalizedQuery = normalizeCategorySearch(categorySearch);
    if (!normalizedQuery) return categoryOptions;

    return categoryOptions
      .map((option) => {
        const haystack = normalizeCategorySearch([
          option.name,
          option.slug,
          option.path.map((entry) => entry.name).join(' '),
          ...option.aliases,
        ].join(' '));
        const startsWith = haystack.startsWith(normalizedQuery) || normalizeCategorySearch(option.name).startsWith(normalizedQuery);
        const includes = haystack.includes(normalizedQuery);
        return { option, startsWith, includes };
      })
      .filter((entry) => entry.includes)
      .sort((a, b) => {
        if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
        if (a.option.level !== b.option.level) return a.option.level - b.option.level;
        return b.option.productCount - a.option.productCount;
      })
      .map((entry) => entry.option);
  }, [categoryOptions, categorySearch]);

  const subcategories = selectedMainNode?.children ?? [];
  const selectedSubcategoryNode = selectedSubcategoryId
    ? findNodeById(categories, selectedSubcategoryId)
    : null;
  const refineCategories = selectedSubcategoryNode?.children ?? [];

  const handleCategorySelect = (option: FlatCategoryOption | null) => {
    const params = new URLSearchParams(searchParams.toString());
    const previousCategoryId = selectedCategoryId;
    const nextRoot = option?.path[0] ?? null;
    const nextBranch = option?.level && option.level > 0 ? option.path[1] ?? null : null;
    const nextLeaf = option?.level === 2 ? option.path[2] ?? null : null;

    if (!nextRoot) {
      params.delete('category');
      params.delete('subcategory');
      params.delete('refineCategory');
    } else {
      params.set('category', nextRoot.id);
      if (nextBranch) params.set('subcategory', nextBranch.id);
      else params.delete('subcategory');
      if (nextLeaf) params.set('refineCategory', nextLeaf.id);
      else params.delete('refineCategory');
    }

    if (!nextRoot || previousCategoryId !== nextRoot.id) {
      params.delete('brand');
      params.delete('size');
      params.delete('color');
      params.delete('gender');
    }

    params.delete('page');
    setCategorySearch('');
    setIsCategoryMenuOpen(false);
    startTransition(() => router.replace(`/?${params.toString()}`));
  };

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
        <div className="relative col-span-1" ref={categoryMenuRef}>
          <button
            type="button"
            className={`input flex min-h-[42px] items-center justify-between gap-3 rounded-2xl px-3 text-left transition-all duration-200 ${isCategoryMenuOpen ? 'border-slate-400 shadow-md ring-2 ring-slate-200' : 'hover:border-slate-400'}`}
            onClick={() => setIsCategoryMenuOpen((open) => !open)}
            aria-haspopup="dialog"
            aria-expanded={isCategoryMenuOpen}
          >
            <span className="min-w-0">
              {selectedCategoryOption ? (
                <span className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-base">{selectedCategoryOption.icon ?? '🛍️'}</span>
                  <span className="min-w-0 truncate font-medium text-slate-800">
                    {selectedCategoryOption.name} <span className="text-slate-400">({selectedCategoryOption.productCount})</span>
                  </span>
                </span>
              ) : (
                <span className="truncate text-slate-500">{t('filters.allCategories')}</span>
              )}
            </span>
            <ChevronDown
              size={18}
              className={`shrink-0 text-slate-500 transition-transform duration-200 ${isCategoryMenuOpen ? 'rotate-180' : ''}`}
            />
          </button>

          <div
            className={`${
              isCategoryMenuOpen ? 'pointer-events-auto visible opacity-100' : 'pointer-events-none invisible opacity-0'
            } fixed inset-x-3 bottom-3 top-24 z-40 transition-opacity duration-200 sm:absolute sm:inset-x-0 sm:bottom-auto sm:top-[calc(100%+0.5rem)]`}
          >
            <div className="absolute inset-0 rounded-[28px] bg-slate-900/20 sm:hidden" onClick={() => setIsCategoryMenuOpen(false)} />
            <div className="absolute inset-x-0 bottom-0 top-auto flex max-h-full flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl transition-all duration-200 sm:relative sm:top-0 sm:max-h-[28rem]">
              <div className="sticky top-0 z-10 space-y-3 border-b border-slate-100 bg-white px-3 py-3 sm:px-4">
                <div className="flex items-center justify-between gap-3 sm:hidden">
                  <p className="text-sm font-semibold text-slate-900">Browse categories</p>
                  <button
                    type="button"
                    className="rounded-full p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    onClick={() => setIsCategoryMenuOpen(false)}
                    aria-label="Close category picker"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="input rounded-2xl pl-9"
                    placeholder="Search categories"
                    value={categorySearch}
                    onChange={(event) => setCategorySearch(event.target.value)}
                  />
                </div>
                {selectedCategoryOption && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected</p>
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {selectedCategoryOption.icon ?? '🛍️'} {selectedCategoryOption.path.map((entry) => entry.name).join(' › ')}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="rounded-full p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
                        onClick={() => handleCategorySelect(null)}
                        aria-label="Clear category selection"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="overflow-y-auto px-2 py-2 sm:px-3">
                <button
                  type="button"
                  className={`mb-1 flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${
                    !selectedCategoryOption ? 'bg-slate-900 text-white shadow-sm' : 'hover:bg-slate-100'
                  }`}
                  onClick={() => handleCategorySelect(null)}
                >
                  <span className="font-medium">{t('filters.allCategories')}</span>
                  {!selectedCategoryOption && <Check size={16} />}
                </button>

                {filteredCategoryOptions.length === 0 ? (
                  <div className="px-3 py-8 text-center text-sm text-slate-500">No matching categories found.</div>
                ) : (
                  filteredCategoryOptions.map((option) => {
                    const isSelected = selectedCategoryOption?.id === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={`mb-1 flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition-all duration-150 ${
                          isSelected
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'border border-transparent hover:border-slate-200 hover:bg-slate-50'
                        }`}
                        style={{ paddingLeft: `${12 + option.level * 18}px` }}
                        onClick={() => handleCategorySelect(option)}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="shrink-0 text-base">{option.icon ?? (option.level === 0 ? '🛍️' : '•')}</span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">{option.name}</span>
                              {option.level > 0 && (
                                <span className={`block truncate text-xs ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                  {option.path.slice(0, -1).map((entry) => entry.name).join(' › ')}
                                </span>
                              )}
                            </span>
                          </span>
                        </span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${isSelected ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                          {option.productCount}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
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
            <option value="">All categories</option>
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
