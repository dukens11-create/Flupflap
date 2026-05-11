"use client";
import { useState } from 'react';

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  level: number;
  icon: string | null;
  sortOrder: number;
  attributeSchema: unknown;
  _count: { mainProducts: number; subProducts: number };
}

interface Props {
  initialCategories: CategoryRow[];
}

const LEVEL_LABELS = ['Main', 'Sub', 'Child'];

function levelBadge(level: number) {
  const colors = ['bg-blue-100 text-blue-800', 'bg-green-100 text-green-800', 'bg-purple-100 text-purple-800'];
  return `inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colors[level] ?? 'bg-slate-100 text-slate-700'}`;
}

export default function AdminCategoryManager({ initialCategories }: Props) {
  const [categories, setCategories] = useState<CategoryRow[]>(initialCategories);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formParentId, setFormParentId] = useState('');
  const [formIcon, setFormIcon] = useState('');
  const [formSortOrder, setFormSortOrder] = useState('0');
  const [formAttributeSchema, setFormAttributeSchema] = useState('');

  function autoSlug(name: string) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function openCreate() {
    setEditingId(null);
    setFormName('');
    setFormSlug('');
    setFormParentId('');
    setFormIcon('');
    setFormSortOrder('0');
    setFormAttributeSchema('');
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function openEdit(cat: CategoryRow) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormParentId(cat.parentId ?? '');
    setFormIcon(cat.icon ?? '');
    setFormSortOrder(String(cat.sortOrder));
    setFormAttributeSchema(cat.attributeSchema ? JSON.stringify(cat.attributeSchema, null, 2) : '');
    setError(null);
    setSuccess(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = {
        name: formName,
        slug: formSlug,
        parentId: formParentId || null,
        icon: formIcon || null,
        sortOrder: Number(formSortOrder) || 0,
        attributeSchema: formAttributeSchema || null,
      };

      let res: Response;
      if (editingId) {
        res = await fetch(`/api/admin/categories/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Something went wrong.');
        return;
      }

      const saved = await res.json();
      if (editingId) {
        // Update the existing category in state
        setCategories(prev => prev.map(c => c.id === editingId ? { ...c, ...saved } : c));
        setSuccess('Category updated.');
      } else {
        // Add the new category to state
        setCategories(prev => [...prev, { ...saved, _count: { mainProducts: 0, subProducts: 0 } }]);
        setSuccess('Category created.');
      }
      setShowForm(false);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete category "${name}"? This cannot be undone.`)) return;
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json();
        setError(j.error ?? 'Failed to delete.');
        return;
      }
      setSuccess(`"${name}" deleted.`);
      setCategories(prev => prev.filter(c => c.id !== id));
    } catch {
      setError('Network error. Please try again.');
    }
  }

  const mainCats = categories.filter(c => c.level === 0);
  const parentOptions = categories.filter(c => c.level < 2); // can only be parent if level < 2

  return (
    <div>
      {/* Messages */}
      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">{success}</div>
      )}

      {/* Create button */}
      {!showForm && (
        <button className="btn-primary mb-6" onClick={openCreate}>+ Add category</button>
      )}

      {/* Create/Edit form */}
      {showForm && (
        <div className="card p-6 mb-6 space-y-4">
          <h2 className="font-bold text-lg">{editingId ? 'Edit category' : 'Add category'}</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name <span className="text-red-500">*</span></label>
              <input
                className="input"
                value={formName}
                onChange={e => {
                  setFormName(e.target.value);
                  if (!editingId) setFormSlug(autoSlug(e.target.value));
                }}
                placeholder="e.g. Electronics"
              />
            </div>
            <div>
              <label className="label">Slug <span className="text-red-500">*</span></label>
              <input
                className="input font-mono text-sm"
                value={formSlug}
                onChange={e => setFormSlug(e.target.value)}
                placeholder="e.g. electronics"
              />
              <p className="text-xs text-slate-400 mt-1">Lowercase letters, numbers, hyphens only.</p>
            </div>
            <div>
              <label className="label">Parent category</label>
              <select className="input" value={formParentId} onChange={e => setFormParentId(e.target.value)}>
                <option value="">— None (top-level) —</option>
                {parentOptions.map(c => (
                  <option key={c.id} value={c.id}>
                    {'  '.repeat(c.level)}{c.name} ({LEVEL_LABELS[c.level] ?? `L${c.level}`})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Icon / Emoji</label>
              <input className="input" value={formIcon} onChange={e => setFormIcon(e.target.value)} placeholder="e.g. 💻" maxLength={10} />
            </div>
            <div>
              <label className="label">Sort order</label>
              <input className="input" type="number" value={formSortOrder} onChange={e => setFormSortOrder(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label">Attribute schema (JSON)</label>
            <textarea
              className="input font-mono text-xs h-40 resize-y"
              value={formAttributeSchema}
              onChange={e => setFormAttributeSchema(e.target.value)}
              placeholder={`[\n  { "name": "brand", "label": "Brand", "type": "text" },\n  { "name": "size", "label": "Size", "type": "select", "options": ["S","M","L","XL"] }\n]`}
            />
            <p className="text-xs text-slate-400 mt-1">
              Optional. Define category-specific fields shown in the seller listing form.
              Each object: <code className="font-mono">{'{ name, label, type: "text"|"select"|"number", options?: string[] }'}</code>
            </p>
          </div>

          <div className="flex gap-3">
            <button className="btn-primary" onClick={handleSave} disabled={saving || !formName || !formSlug}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create category'}
            </button>
            <button className="btn-outline" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Category tree */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left font-semibold">Name</th>
              <th className="px-4 py-3 text-left font-semibold hidden sm:table-cell">Level</th>
              <th className="px-4 py-3 text-left font-semibold hidden md:table-cell">Slug</th>
              <th className="px-4 py-3 text-left font-semibold hidden lg:table-cell">Products</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {mainCats.map(main => {
              const subs = categories.filter(c => c.parentId === main.id);
              return [
                <CategoryRow key={main.id} cat={main} onEdit={openEdit} onDelete={handleDelete} />,
                ...subs.flatMap(sub => {
                  const children = categories.filter(c => c.parentId === sub.id);
                  return [
                    <CategoryRow key={sub.id} cat={sub} onEdit={openEdit} onDelete={handleDelete} />,
                    ...children.map(child => (
                      <CategoryRow key={child.id} cat={child} onEdit={openEdit} onDelete={handleDelete} />
                    )),
                  ];
                }),
              ];
            })}
          </tbody>
        </table>
        {categories.length === 0 && (
          <div className="px-4 py-12 text-center text-slate-500">
            No categories yet. Click <strong>+ Add category</strong> to get started.
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryRow({
  cat,
  onEdit,
  onDelete,
}: {
  cat: CategoryRow;
  onEdit: (cat: CategoryRow) => void;
  onDelete: (id: string, name: string) => void;
}) {
  const indent = cat.level * 20;
  const productCount = cat._count.mainProducts + cat._count.subProducts;

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3">
        <div style={{ paddingLeft: indent }} className="flex items-center gap-2">
          {cat.level > 0 && <span className="text-slate-300 select-none">└</span>}
          {cat.icon && <span>{cat.icon}</span>}
          <span className="font-medium">{cat.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 hidden sm:table-cell">
        <span className={levelBadge(cat.level)}>{LEVEL_LABELS[cat.level] ?? `L${cat.level}`}</span>
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <code className="text-xs text-slate-500">{cat.slug}</code>
      </td>
      <td className="px-4 py-3 hidden lg:table-cell text-slate-500">
        {productCount > 0 ? productCount : <span className="text-slate-300">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex justify-end gap-2">
          <button
            className="text-xs text-blue-600 hover:underline"
            onClick={() => onEdit(cat)}
          >
            Edit
          </button>
          <button
            className="text-xs text-red-600 hover:underline"
            onClick={() => onDelete(cat.id, cat.name)}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
