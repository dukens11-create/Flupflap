"use client";
import { useState } from 'react';

interface Props {
  productId: string;
  currentInventory: number;
}

export default function SellerStockEditor({ productId, currentInventory }: Props) {
  const [inventory, setInventory] = useState(currentInventory);
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(String(currentInventory));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  function startEdit() {
    setInputValue(String(inventory));
    setEditing(true);
    setError('');
    setSaved(false);
  }

  function cancel() {
    setEditing(false);
    setError('');
  }

  async function save() {
    const value = parseInt(inputValue, 10);
    if (!Number.isInteger(value) || value < 0 || value > 9999) {
      setError('Enter a value between 0 and 9999.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/seller/products/${productId}/inventory`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to update stock.');
      } else {
        setInventory(value);
        setEditing(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        <input
          type="number"
          min={0}
          max={9999}
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          className="input w-20 text-sm py-1 px-2"
          autoFocus
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
        />
        <button
          onClick={save}
          disabled={saving}
          className="btn bg-green-600 hover:bg-green-700 text-white text-xs py-1 px-2 disabled:opacity-60"
        >
          {saving ? '…' : 'Save'}
        </button>
        <button onClick={cancel} className="btn-outline text-xs py-1 px-2">Cancel</button>
        {error && <p className="text-xs text-red-600 ml-1">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-shrink-0 text-xs">
      <span className={`font-semibold ${inventory <= 0 ? 'text-red-600' : inventory <= 5 ? 'text-orange-600' : 'text-green-700'}`}>
        {inventory <= 0 ? 'Out of stock' : `Stock: ${inventory}`}
      </span>
      {saved && <span className="text-green-600 ml-1">✓ Saved</span>}
      <button onClick={startEdit} className="btn-outline text-xs py-1 px-2 ml-1">Edit Stock</button>
    </div>
  );
}
