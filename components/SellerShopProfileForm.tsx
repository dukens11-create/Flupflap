'use client';
import { useState } from 'react';

interface Props {
  initialShopName: string | null;
  initialShopLogoUrl: string | null;
  initialShopDescription: string | null;
}

export default function SellerShopProfileForm({
  initialShopName,
  initialShopLogoUrl,
  initialShopDescription,
}: Props) {
  const [shopName, setShopName] = useState(initialShopName ?? '');
  const [shopLogoUrl, setShopLogoUrl] = useState(initialShopLogoUrl ?? '');
  const [shopDescription, setShopDescription] = useState(initialShopDescription ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: shopName.trim() || undefined,
          shopLogoUrl: shopLogoUrl.trim() || '',
          shopDescription: shopDescription.trim() || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setErrorMsg(data?.error ?? 'Failed to save shop profile.');
        return;
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 3000);
    } catch {
      setStatus('error');
      setErrorMsg('Network error. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="shopName">
          Shop / Business name <span className="text-red-500">*</span>
        </label>
        <input
          id="shopName"
          type="text"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          maxLength={80}
          required
          placeholder="e.g. Cool Finds Store"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          This is the name buyers will see on product listings instead of your personal name.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="shopLogoUrl">
          Shop logo URL <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="shopLogoUrl"
          type="url"
          value={shopLogoUrl}
          onChange={(e) => setShopLogoUrl(e.target.value)}
          maxLength={2000}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-slate-400">
          Paste the URL of an image to use as your shop logo.
        </p>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1" htmlFor="shopDescription">
          Short shop description <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="shopDescription"
          value={shopDescription}
          onChange={(e) => setShopDescription(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell buyers a little about your shop…"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        <p className="mt-1 text-xs text-slate-400">{shopDescription.length}/500</p>
      </div>

      {status === 'error' && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {errorMsg}
        </p>
      )}
      {status === 'saved' && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          ✅ Shop profile saved successfully.
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !shopName.trim()}
        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'saving' ? 'Saving…' : 'Save shop profile'}
      </button>
    </form>
  );
}
