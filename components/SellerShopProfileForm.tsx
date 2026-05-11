'use client';
import { useState } from 'react';

const INPUT_CLASS = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

interface Props {
  initialShopName: string | null;
  initialShopLogoUrl: string | null;
  initialShopDescription: string | null;
  initialShipFromName: string | null;
  initialShipFromStreet: string | null;
  initialShipFromCity: string | null;
  initialShipFromState: string | null;
  initialShipFromZip: string | null;
  initialShipFromCountry: string | null;
  initialShipFromPhone: string | null;
}

export default function SellerShopProfileForm({
  initialShopName,
  initialShopLogoUrl,
  initialShopDescription,
  initialShipFromName,
  initialShipFromStreet,
  initialShipFromCity,
  initialShipFromState,
  initialShipFromZip,
  initialShipFromCountry,
  initialShipFromPhone,
}: Props) {
  const [shopName, setShopName] = useState(initialShopName ?? '');
  const [shopLogoUrl, setShopLogoUrl] = useState(initialShopLogoUrl ?? '');
  const [shopDescription, setShopDescription] = useState(initialShopDescription ?? '');
  const [shipFromName, setShipFromName] = useState(initialShipFromName ?? '');
  const [shipFromStreet, setShipFromStreet] = useState(initialShipFromStreet ?? '');
  const [shipFromCity, setShipFromCity] = useState(initialShipFromCity ?? '');
  const [shipFromState, setShipFromState] = useState(initialShipFromState ?? '');
  const [shipFromZip, setShipFromZip] = useState(initialShipFromZip ?? '');
  const [shipFromCountry, setShipFromCountry] = useState(initialShipFromCountry ?? 'US');
  const [shipFromPhone, setShipFromPhone] = useState(initialShipFromPhone ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const trimmedShopName = shopName.trim();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('saving');
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shopName: trimmedShopName,
          shopLogoUrl: shopLogoUrl.trim(),
          shopDescription: shopDescription.trim(),
          shipFromName: shipFromName.trim(),
          shipFromStreet: shipFromStreet.trim(),
          shipFromCity: shipFromCity.trim(),
          shipFromState: shipFromState.trim(),
          shipFromZip: shipFromZip.trim(),
          shipFromCountry: shipFromCountry.trim(),
          shipFromPhone: shipFromPhone.trim(),
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
          className={INPUT_CLASS}
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
          className={INPUT_CLASS}
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

      {/* Ship-From Address */}
      <fieldset className="border border-slate-200 rounded-xl p-4 space-y-3">
        <legend className="text-sm font-semibold text-slate-700 px-1">📦 Ship-From Address</legend>
        <p className="text-xs text-slate-500">
          Required for automatic shipping rate calculation at buyer checkout. Your exact address is never shown publicly.
        </p>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromName">
            Full name / Business name
          </label>
          <input
            id="shipFromName"
            type="text"
            value={shipFromName}
            onChange={(e) => setShipFromName(e.target.value)}
            maxLength={100}
            placeholder="e.g. Jane Smith or Cool Finds Store"
            className={INPUT_CLASS}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromStreet">
            Street address
          </label>
          <input
            id="shipFromStreet"
            type="text"
            value={shipFromStreet}
            onChange={(e) => setShipFromStreet(e.target.value)}
            maxLength={200}
            placeholder="e.g. 123 Main St"
            className={INPUT_CLASS}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromCity">
              City
            </label>
            <input
              id="shipFromCity"
              type="text"
              value={shipFromCity}
              onChange={(e) => setShipFromCity(e.target.value)}
              maxLength={100}
              placeholder="e.g. New York"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromState">
              State (2-letter abbreviation)
            </label>
            <input
              id="shipFromState"
              type="text"
              value={shipFromState}
              onChange={(e) => setShipFromState(e.target.value)}
              maxLength={2}
              placeholder="e.g. NY"
              className={INPUT_CLASS}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromZip">
              ZIP / Postal code
            </label>
            <input
              id="shipFromZip"
              type="text"
              value={shipFromZip}
              onChange={(e) => setShipFromZip(e.target.value)}
              maxLength={20}
              placeholder="e.g. 10001"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromCountry">
              Country
            </label>
            <select
              id="shipFromCountry"
              value={shipFromCountry}
              onChange={(e) => setShipFromCountry(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="US">United States (US)</option>
              <option value="CA">Canada (CA)</option>
              <option value="GB">United Kingdom (GB)</option>
              <option value="AU">Australia (AU)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1" htmlFor="shipFromPhone">
            Phone number <span className="text-slate-400 font-normal">(optional)</span>
          </label>
          <input
            id="shipFromPhone"
            type="tel"
            value={shipFromPhone}
            onChange={(e) => setShipFromPhone(e.target.value)}
            maxLength={30}
            placeholder="e.g. +12125550100"
            className={INPUT_CLASS}
          />
        </div>
      </fieldset>

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
        disabled={status === 'saving' || !trimmedShopName}
        className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {status === 'saving' ? 'Saving…' : 'Save shop profile'}
      </button>
    </form>
  );
}
