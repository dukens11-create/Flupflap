"use client";
import { useState, useEffect, useRef } from 'react';

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
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  attributeSchema: FieldDef[] | null;
  children: CategoryNode[];
}

interface Props {
  defaultCategoryId?: string | null;
  defaultSubcategoryId?: string | null;
  defaultAttributes?: Record<string, string> | null;
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

  const [mainId, setMainId] = useState<string | null>(defaultCategoryId ?? null);
  const [subId, setSubId] = useState<string | null>(defaultSubcategoryId ?? null);
  const [childId, setChildId] = useState<string | null>(null);
  const [attrs, setAttrs] = useState<Record<string, string>>(defaultAttributes ?? {});

  // Reset attribute state when defaultAttributes prop changes (e.g. editing different products)
  useEffect(() => {
    setAttrs(defaultAttributes ?? {});
  }, [defaultAttributes]);

  useEffect(() => {
    fetch('/api/categories')
      .then(r => r.json())
      .then((data: CategoryNode[]) => {
        setCategories(data);
        setLoading(false);

        // If defaultSubcategoryId is set, figure out its parent main category if not provided
        if (defaultSubcategoryId && !defaultCategoryId) {
          const node = findNodeById(data, defaultSubcategoryId);
          if (node?.parentId) {
            const parent = findNodeById(data, node.parentId);
            if (parent?.level === 0) setMainId(parent.id);
            else if (parent?.parentId) {
              setSubId(parent.id);
              const grandParent = findNodeById(data, parent.parentId);
              if (grandParent) setMainId(grandParent.id);
            }
          }
        }
      })
      .catch(() => setLoading(false));
  }, [defaultCategoryId, defaultSubcategoryId]);

  const mainNode = mainId ? findNodeById(categories, mainId) : null;
  const subNode = subId ? findNodeById(categories, subId) : null;

  // Children of main = subcategories
  const subcategories = mainNode?.children ?? [];
  // Children of sub = child categories
  const childCategories = subNode?.children ?? [];

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

  function handleMainChange(id: string) {
    setMainId(id || null);
    setSubId(null);
    setChildId(null);
    setAttrs({});
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

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="label">Category</div>
        <div className="input flex items-center text-slate-400 text-sm">Loading categories…</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Hidden form fields */}
      <input type="hidden" name="categoryId" value={mainId ?? ''} />
      <input type="hidden" name="subcategoryId" value={effectiveSubId ?? ''} />
      <input type="hidden" name="category" value={leafName} />
      <input type="hidden" name="productAttributes" value={JSON.stringify(attrs)} />

      {/* Main category */}
      <div>
        <label className="label">Category <span className="text-red-500">*</span></label>
        <select
          className="input"
          value={mainId ?? ''}
          onChange={e => handleMainChange(e.target.value)}
          required
        >
          <option value="">Select a category…</option>
          {categories.map(c => (
            <option key={c.id} value={c.id}>
              {c.icon ? `${c.icon} ` : ''}{c.name}
            </option>
          ))}
        </select>
      </div>

      {/* Subcategory (level 1) */}
      {subcategories.length > 0 && (
        <div>
          <label className="label">Subcategory</label>
          <select
            className="input"
            value={subId ?? ''}
            onChange={e => handleSubChange(e.target.value)}
          >
            <option value="">Select a subcategory…</option>
            {subcategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Child category (level 2) */}
      {childCategories.length > 0 && (
        <div>
          <label className="label">Refine category</label>
          <select
            className="input"
            value={childId ?? ''}
            onChange={e => handleChildChange(e.target.value)}
          >
            <option value="">Select…</option>
            {childCategories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
