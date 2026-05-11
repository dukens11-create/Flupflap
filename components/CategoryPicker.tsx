"use client";
import { useState, useEffect, useRef, useMemo } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  options?: string[];
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  aliases?: string[];
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  attributeSchema: FieldDef[] | null;
  children: CategoryNode[];
}

interface PickerOption {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
  icon?: string | null;
}

interface Props {
  defaultCategoryId?: string | null;
  defaultSubcategoryId?: string | null;
  defaultAttributes?: Record<string, string> | null;
}

const SEARCH_DEBOUNCE_MS = 140;
const CLOSEST_MATCH_LIMIT = 6;

const STATIC_CATEGORY_ALIASES: Record<string, string[]> = {
  'fashion-women-perfume': ['perfume', 'perfum', 'fragrance', 'cologne', 'body mist', 'scent'],
  electronics: ['electronic', 'electr', 'tech', 'gadget'],
  'fashion-kids-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
  'sports-clothing': ['clothing', 'cloth', 'clothes', 'apparel'],
};

function normalizeSearchTerm(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '');
}

function singularize(value: string): string {
  if (value.length <= 3) return value;
  if (value.endsWith('ies')) return `${value.slice(0, -3)}y`;
  if (value.endsWith('es')) return value.slice(0, -2);
  if (value.endsWith('s')) return value.slice(0, -1);
  return value;
}

function variantsForTerm(value: string): string[] {
  const normalized = normalizeSearchTerm(value);
  if (!normalized) return [];
  const singular = singularize(normalized);
  return singular === normalized ? [normalized] : [normalized, singular];
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  const current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + substitutionCost,
      );
    }
    for (let j = 0; j <= b.length; j += 1) previous[j] = current[j];
  }

  return previous[b.length];
}

function scoreSearchTerm(query: string, term: string): { score: number; distance: number; strong: boolean } {
  if (!query || !term) return { score: 0, distance: Number.MAX_SAFE_INTEGER, strong: false };

  if (query === term) return { score: 120, distance: 0, strong: true };

  if (term.startsWith(query)) {
    return { score: 105 - Math.max(0, term.length - query.length), distance: Math.max(0, term.length - query.length), strong: true };
  }

  if (term.includes(query)) {
    return { score: 92 - Math.max(0, term.length - query.length), distance: Math.max(0, term.length - query.length), strong: true };
  }

  const distance = levenshteinDistance(query, term);
  const tolerance = Math.max(1, Math.floor(query.length * 0.35));
  if (distance <= tolerance) {
    return {
      score: 78 - distance * 8,
      distance,
      strong: distance <= Math.max(1, Math.floor(query.length * 0.25)),
    };
  }

  return { score: 10 - distance, distance, strong: false };
}

function rankPickerOptions(options: PickerOption[], query: string) {
  const normalizedQueryVariants = variantsForTerm(query.trim());
  if (!normalizedQueryVariants.length) {
    return options.map(option => ({ option, score: 0, distance: 0, strong: true }));
  }

  const ranked = options.map(option => {
    const terms = new Set<string>();
    for (const term of [option.name, option.slug, ...option.aliases]) {
      for (const variant of variantsForTerm(term)) {
        terms.add(variant);
      }
    }

    let bestScore = Number.NEGATIVE_INFINITY;
    let bestDistance = Number.MAX_SAFE_INTEGER;
    let strong = false;

    for (const q of normalizedQueryVariants) {
      for (const term of terms) {
        const result = scoreSearchTerm(q, term);
        if (result.score > bestScore || (result.score === bestScore && result.distance < bestDistance)) {
          bestScore = result.score;
          bestDistance = result.distance;
          strong = result.strong;
        }
      }
    }

    return {
      option,
      score: bestScore,
      distance: bestDistance,
      strong,
    };
  });

  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.option.name.localeCompare(b.option.name);
  });

  const strongMatches = ranked.filter(item => item.strong || item.score >= 65);
  if (strongMatches.length > 0) return strongMatches;

  return ranked.slice(0, CLOSEST_MATCH_LIMIT);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function findNodeById(nodes: CategoryNode[], id: string): CategoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findNodeById(n.children, id);
    if (found) return found;
  }
  return null;
}

/** Returns the deepest selected node's attributeSchema (or null). */
function resolveSchema(
  categories: CategoryNode[],
  mainId: string | null,
  subId: string | null,
  childId: string | null,
): FieldDef[] | null {
  const targetId = childId ?? subId ?? mainId;
  if (!targetId) return null;
  const node = findNodeById(categories, targetId);
  if (!node) return null;
  return Array.isArray(node.attributeSchema) ? node.attributeSchema : null;
}

/** Returns the slug of the most specific selected category. */
function resolveLeafSlug(
  categories: CategoryNode[],
  mainId: string | null,
  subId: string | null,
  childId: string | null,
): string {
  const targetId = childId ?? subId ?? mainId;
  if (!targetId) return '';
  const node = findNodeById(categories, targetId);
  return node?.slug ?? '';
}

/** Returns the name of the most specific selected category. */
function resolveLeafName(
  categories: CategoryNode[],
  mainId: string | null,
  subId: string | null,
  childId: string | null,
): string {
  const targetId = childId ?? subId ?? mainId;
  if (!targetId) return '';
  const node = findNodeById(categories, targetId);
  return node?.name ?? '';
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CategoryPicker({ defaultCategoryId, defaultSubcategoryId, defaultAttributes }: Props) {
  const [categories, setCategories] = useState<CategoryNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [mainId, setMainId] = useState<string | null>(defaultCategoryId ?? null);
  const [subId, setSubId] = useState<string | null>(defaultSubcategoryId ?? null);
  const [childId, setChildId] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<Record<string, string>>(defaultAttributes ?? {});
  const [activePicker, setActivePicker] = useState<'main' | 'sub' | 'child' | null>(null);
  const [searchInputValue, setSearchInputValue] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const triggerRefs = useRef<{
    main: HTMLButtonElement | null;
    sub: HTMLButtonElement | null;
    child: HTMLButtonElement | null;
  }>({
    main: null,
    sub: null,
    child: null,
  });
  const lastTriggerRef = useRef<'main' | 'sub' | 'child' | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Reset attribute state when defaultAttributes prop changes (e.g. editing different products)
  useEffect(() => {
    setAttrs(defaultAttributes ?? {});
  }, [defaultAttributes]);

  useEffect(() => {
    let mounted = true;

    async function loadCategories() {
      setLoading(true);
      setLoadError(false);

      try {
        const response = await fetch('/api/categories');
        if (!response.ok) throw new Error('Failed to load categories');

        const data = (await response.json()) as CategoryNode[];
        if (!mounted) return;

        const nextCategories = Array.isArray(data) ? data : [];
        setCategories(nextCategories);

        // If defaultSubcategoryId is set, figure out its parent main category if not provided
        if (defaultSubcategoryId && !defaultCategoryId) {
          const node = findNodeById(nextCategories, defaultSubcategoryId);
          if (node?.parentId) {
            const parent = findNodeById(nextCategories, node.parentId);
            if (parent?.level === 0) setMainId(parent.id);
            else if (parent?.parentId) {
              setSubId(parent.id);
              const grandParent = findNodeById(data, parent.parentId);
              if (grandParent) setMainId(grandParent.id);
            }
          }
        }
      } catch {
        if (!mounted) return;
        setLoadError(true);
        setCategories([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCategories();

    return () => {
      mounted = false;
    };
  }, [defaultCategoryId, defaultSubcategoryId, reloadToken]);

  const mainNode = mainId ? findNodeById(categories, mainId) : null;
  const subNode = subId ? findNodeById(categories, subId) : null;

  // Children of main = subcategories
  const subcategories = mainNode?.children ?? [];
  // Children of sub = child categories
  const childCategories = subNode?.children ?? [];

  function resolveAliases(node: CategoryNode): string[] {
    const normalizedSlug = node.slug.toLowerCase();
    const explicitAliases = Array.isArray(node.aliases) ? node.aliases : [];
    const staticAliases = STATIC_CATEGORY_ALIASES[normalizedSlug] ?? [];
    return [...new Set([...explicitAliases, ...staticAliases])];
  }

  const mainOptions = useMemo<PickerOption[]>(
    () => categories.map(c => ({ id: c.id, name: c.name, slug: c.slug, aliases: resolveAliases(c), icon: c.icon })),
    [categories],
  );
  const subOptions = useMemo<PickerOption[]>(
    () => subcategories.map(c => ({ id: c.id, name: c.name, slug: c.slug, aliases: resolveAliases(c), icon: null })),
    [subcategories],
  );
  const childOptions = useMemo<PickerOption[]>(
    () => childCategories.map(c => ({ id: c.id, name: c.name, slug: c.slug, aliases: resolveAliases(c), icon: null })),
    [childCategories],
  );

  const schema = resolveSchema(categories, mainId, subId, childId);
  const leafName = resolveLeafName(categories, mainId, subId, childId);
  const leafSlug = resolveLeafSlug(categories, mainId, subId, childId);

  // Notify sibling components (e.g. ConditionPicker) about the resolved category slug.
  // Dispatches on meaningful transitions: when a category is selected (non-empty slug) or
  // when the category is cleared after a previous selection (empty slug after non-empty).
  const prevSlugRef = useRef<string>('');
  useEffect(() => {
    if (leafSlug && leafSlug !== prevSlugRef.current) {
      prevSlugRef.current = leafSlug;
      window.dispatchEvent(
        new CustomEvent('ff:category-change', { detail: { slug: leafSlug } }),
      );
    } else if (!leafSlug && prevSlugRef.current) {
      // Category was cleared — reset to general conditions
      prevSlugRef.current = '';
      window.dispatchEvent(
        new CustomEvent('ff:category-change', { detail: { slug: '' } }),
      );
    }
  }, [leafSlug]);

  // Hidden field values for form submission
  const effectiveSubId = childId ?? subId;

  useEffect(() => {
    if (!activePicker) return;

    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyTouchAction = document.body.style.touchAction;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = 'hidden';
    document.body.style.touchAction = 'none';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.touchAction = previousBodyTouchAction;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [activePicker]);

  useEffect(() => {
    if (!activePicker) {
      setSearchInputValue('');
      setDebouncedSearchQuery('');
    }
  }, [activePicker]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchInputValue);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInputValue]);

  useEffect(() => {
    if (!activePicker && lastTriggerRef.current) {
      const key = lastTriggerRef.current;
      triggerRefs.current[key]?.focus();
      lastTriggerRef.current = null;
    }
  }, [activePicker]);

  useEffect(() => {
    if (!activePicker) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setActivePicker(null);
      }
    }

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [activePicker]);

  useEffect(() => {
    if (!activePicker) return;

    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activePicker]);

  useEffect(() => {
    const form = wrapperRef.current?.closest('form');
    if (!form) return;

    function handleSubmit(event: Event) {
      if (!mainId) {
        event.preventDefault();
        setCategoryError('Please select a category.');
      }
    }

    form.addEventListener('submit', handleSubmit);
    return () => form.removeEventListener('submit', handleSubmit);
  }, [mainId]);

  function handleMainChange(id: string) {
    setMainId(id || null);
    setSubId(null);
    setChildId(null);
    setAttrs({});
    setCategoryError('');
  }

  function handleSubChange(id: string) {
    setSubId(id || null);
    setChildId(null);
    setAttrs({});
  }

  function handleChildChange(id: string) {
    setChildId(id || null);
    setAttrs({});
  }

  function handleAttrChange(name: string, value: string) {
    setAttrs(prev => ({ ...prev, [name]: value }));
  }

  function getPickerConfig() {
    if (activePicker === 'main') {
      return {
        label: 'Category',
        placeholder: 'Search categories...',
        emptyLabel: 'No categories found.',
        options: mainOptions,
        selectedId: mainId,
        onSelect: (id: string) => handleMainChange(id),
      };
    }
    if (activePicker === 'sub') {
      return {
        label: 'Subcategory',
        placeholder: 'Search subcategories...',
        emptyLabel: 'No subcategories found.',
        options: subOptions,
        selectedId: subId,
        onSelect: (id: string) => handleSubChange(id),
      };
    }
    if (activePicker === 'child') {
      return {
        label: 'Refine category',
        placeholder: 'Search categories...',
        emptyLabel: 'No matching categories found.',
        options: childOptions,
        selectedId: childId,
        onSelect: (id: string) => handleChildChange(id),
      };
    }
    return null;
  }

  function findOptionName(options: PickerOption[], id: string | null): string {
    if (!id) return '';
    return options.find(option => option.id === id)?.name ?? '';
  }

  function renderPickerTrigger(params: {
    pickerKey: 'main' | 'sub' | 'child';
    label: string;
    required?: boolean;
    placeholder: string;
    disabled?: boolean;
    selectedName: string;
    onOpen: () => void;
    invalid?: boolean;
    errorText?: string;
  }) {
    const {
      pickerKey,
      label,
      required,
      placeholder,
      disabled,
      selectedName,
      onOpen,
      invalid,
      errorText,
    } = params;

    return (
      <div>
        <label className="label">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <button
          type="button"
          ref={el => {
            triggerRefs.current[pickerKey] = el;
          }}
          className={`input flex items-center justify-between text-left ${disabled ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : ''} ${invalid ? 'border-red-500 ring-1 ring-red-100' : ''}`}
          onClick={onOpen}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-invalid={invalid}
        >
          <span className={selectedName ? 'text-slate-900' : 'text-slate-400'}>
            {selectedName || placeholder}
          </span>
          <span className="text-slate-500">▾</span>
        </button>
        {errorText ? <p className="mt-1 text-xs text-red-600">{errorText}</p> : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="label">Category</div>
        <div className="input flex items-center text-slate-400 text-sm">Loading categories...</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        <div className="label">Category</div>
        <div className="input flex items-center text-red-600 text-sm">
          Unable to load categories. Please try again.
        </div>
        <button
          type="button"
          className="btn-outline"
          onClick={() => setReloadToken(prev => prev + 1)}
        >
          Try again
        </button>
      </div>
    );
  }

  const pickerConfig = getPickerConfig();
  const rankedOptions = pickerConfig ? rankPickerOptions(pickerConfig.options, debouncedSearchQuery) : [];
  const filteredOptions = rankedOptions.map(item => item.option);
  const showingClosestMatches = debouncedSearchQuery.trim().length > 0 && rankedOptions.length > 0 && !rankedOptions.some(item => item.strong);

  return (
    <div className="space-y-3" ref={wrapperRef}>
      {/* Hidden form fields */}
      <input type="hidden" name="categoryId" value={mainId ?? ''} />
      <input type="hidden" name="subcategoryId" value={effectiveSubId ?? ''} />
      <input type="hidden" name="category" value={leafName} />
      <input type="hidden" name="productAttributes" value={JSON.stringify(attrs)} />

      {/* Main category */}
      {renderPickerTrigger({
        pickerKey: 'main',
        label: 'Category',
        required: true,
        placeholder: 'Select a category...',
        selectedName: findOptionName(mainOptions, mainId),
        onOpen: () => {
          lastTriggerRef.current = 'main';
          setActivePicker('main');
        },
        invalid: !!categoryError,
        errorText: categoryError,
      })}

      {/* Subcategory (level 1) */}
      {subcategories.length > 0 && (
        renderPickerTrigger({
          pickerKey: 'sub',
          label: 'Subcategory',
          placeholder: 'Select a subcategory...',
          selectedName: findOptionName(subOptions, subId),
          onOpen: () => {
            lastTriggerRef.current = 'sub';
            setActivePicker('sub');
          },
        })
      )}

      {/* Child category (level 2) */}
      {childCategories.length > 0 && (
        renderPickerTrigger({
          pickerKey: 'child',
          label: 'Refine category',
          placeholder: 'Select a category...',
          selectedName: findOptionName(childOptions, childId),
          onOpen: () => {
            lastTriggerRef.current = 'child';
            setActivePicker('child');
          },
        })
      )}

      {pickerConfig && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center sm:justify-center"
          role="dialog"
          aria-modal="true"
          aria-label={pickerConfig.label}
          onClick={() => setActivePicker(null)}
        >
          <div
            className="absolute inset-0 bg-slate-900/45"
            role="presentation"
          />
          <div
            className="relative z-[60] w-full max-h-[82vh] rounded-t-2xl sm:rounded-2xl sm:max-w-xl bg-white border border-slate-200 shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <div className="font-semibold text-slate-900">{pickerConfig.label}</div>
              <button
                type="button"
                className="text-slate-500 hover:text-slate-700 text-sm"
                onClick={() => setActivePicker(null)}
              >
                Close
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                ref={searchInputRef}
                value={searchInputValue}
                onChange={e => setSearchInputValue(e.target.value)}
                placeholder={pickerConfig.placeholder}
                className="input"
              />
            </div>
            <div className="max-h-[56vh] overflow-y-auto overscroll-contain">
              {filteredOptions.length > 0 ? (
                <>
                  {showingClosestMatches ? (
                    <div className="px-4 pb-2 text-xs text-slate-500">Showing closest matches</div>
                  ) : null}
                  <ul className="divide-y divide-slate-100">
                    {filteredOptions.map(option => {
                      const isSelected = pickerConfig.selectedId === option.id;
                      return (
                        <li key={option.id}>
                          <button
                            type="button"
                            className={`w-full px-4 py-3 text-left transition-colors ${isSelected ? 'bg-slate-50 text-slate-900 font-medium' : 'text-slate-700 hover:bg-slate-50'}`}
                            onClick={() => {
                              pickerConfig.onSelect(option.id);
                              setActivePicker(null);
                            }}
                          >
                            {option.icon ? `${option.icon} ` : ''}{option.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              ) : (
                <div className="px-4 py-6 text-sm text-slate-500">{pickerConfig.emptyLabel}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Category-specific attribute fields */}
      {schema && schema.length > 0 && (
        <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
          <legend className="text-sm font-semibold text-slate-700 px-1">Item details</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {schema.map(field => (
              <div key={field.name}>
                <label className="label">{field.label}</label>
                {field.type === 'select' && field.options ? (
                  <select
                    className="input"
                    value={attrs[field.name] ?? ''}
                    onChange={e => handleAttrChange(field.name, e.target.value)}
                  >
                    <option value="">Select…</option>
                    {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type === 'number' ? 'number' : 'text'}
                    className="input"
                    placeholder={field.label}
                    value={attrs[field.name] ?? ''}
                    onChange={e => handleAttrChange(field.name, e.target.value)}
                    min={field.type === 'number' ? 0 : undefined}
                  />
                )}
              </div>
            ))}
          </div>
        </fieldset>
      )}
    </div>
  );
}
