'use client';

import { useState } from 'react';

type RateQuote = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  deliveryDays: number | null;
};

function toRateQuote(value: unknown): RateQuote | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id : '';
  const carrier = typeof raw.carrier === 'string' ? raw.carrier : '';
  const service = typeof raw.service === 'string' ? raw.service : '';
  const rate = typeof raw.rate === 'string' ? raw.rate : '';
  const currency = typeof raw.currency === 'string' ? raw.currency : '';
  if (!id || !carrier || !service || !rate || !currency) return null;
  return {
    id,
    carrier,
    service,
    rate,
    currency,
    deliveryDays: typeof raw.deliveryDays === 'number' ? raw.deliveryDays : null,
  };
}

export default function SellerShippingLabelForm({
  orderId,
  canCreateLabel,
  existingLabelUrl,
  existingTrackingNumber,
  existingCarrier,
  existingService,
  existingTrackingUrl,
}: {
  orderId: string;
  canCreateLabel: boolean;
  existingLabelUrl?: string | null;
  existingTrackingNumber?: string | null;
  existingCarrier?: string | null;
  existingService?: string | null;
  existingTrackingUrl?: string | null;
}) {
  const [weightOz, setWeightOz] = useState('16');
  const [lengthIn, setLengthIn] = useState('10');
  const [widthIn, setWidthIn] = useState('8');
  const [heightIn, setHeightIn] = useState('4');
  const [rates, setRates] = useState<RateQuote[]>([]);
  const [shipmentId, setShipmentId] = useState('');
  const [selectedRateId, setSelectedRateId] = useState('');
  const [labelUrl, setLabelUrl] = useState(existingLabelUrl ?? '');
  const [trackingNumber, setTrackingNumber] = useState(existingTrackingNumber ?? '');
  const [carrier, setCarrier] = useState(existingCarrier ?? '');
  const [service, setService] = useState(existingService ?? '');
  const [trackingUrl, setTrackingUrl] = useState(existingTrackingUrl ?? '');
  const [loadingRates, setLoadingRates] = useState(false);
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleCreateLabel() {
    setError('');
    setSuccess('');

    // Client-side validation: all dimensions must be positive numbers.
    const parsedWeight = Number(weightOz);
    const parsedLength = Number(lengthIn);
    const parsedWidth = Number(widthIn);
    const parsedHeight = Number(heightIn);
    if (!Number.isFinite(parsedWeight) || parsedWeight <= 0) {
      setError('Weight must be a positive number (oz).');
      return;
    }
    if (!Number.isFinite(parsedLength) || parsedLength <= 0) {
      setError('Length must be a positive number (in).');
      return;
    }
    if (!Number.isFinite(parsedWidth) || parsedWidth <= 0) {
      setError('Width must be a positive number (in).');
      return;
    }
    if (!Number.isFinite(parsedHeight) || parsedHeight <= 0) {
      setError('Height must be a positive number (in).');
      return;
    }

    setLoadingRates(true);
    try {
      const res = await fetch('/api/seller/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'rates',
          orderId,
          weightOz,
          lengthIn,
          widthIn,
          heightIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to fetch rates.');
        return;
      }
      const sanitizedRates = Array.isArray(data.rates)
        ? data.rates.map(toRateQuote).filter((rate: RateQuote | null): rate is RateQuote => rate !== null)
        : [];
      setRates(sanitizedRates);
      setShipmentId(data.shipmentId ?? '');
      setSelectedRateId(sanitizedRates[0]?.id ?? '');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoadingRates(false);
    }
  }

  async function handlePurchase() {
    if (!shipmentId || !selectedRateId) return;
    setError('');
    setSuccess('');
    setLoadingPurchase(true);
    try {
      const res = await fetch('/api/seller/ship', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'purchase',
          orderId,
          shipmentId,
          rateId: selectedRateId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to purchase label.');
        return;
      }
      setLabelUrl(data.labelUrl ?? '');
      setTrackingNumber(data.trackingNumber ?? '');
      setCarrier(data.carrier ?? '');
      setService(data.service ?? '');
      setTrackingUrl(data.trackingUrl ?? '');
      setSuccess('Label purchased successfully.');
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoadingPurchase(false);
    }
  }

  async function handleDownloadLabel() {
    if (!labelUrl) return;
    try {
      const res = await fetch(`/api/seller/label-download?orderId=${encodeURIComponent(orderId)}`);
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objUrl;
      link.download = `shipping-label-${orderId}.pdf`;
      link.click();
      URL.revokeObjectURL(objUrl);
    } catch {
      window.open(`/api/seller/label-download?orderId=${encodeURIComponent(orderId)}`, '_blank');
    }
  }

  const hasLabel = !!labelUrl;
  const hasTracking = !!trackingNumber;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <span className="text-base" aria-hidden="true">🏷️</span>
        <h3 className="text-sm font-semibold text-slate-800">Shipping Labels</h3>
        {hasLabel && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            ✓ Label Ready
          </span>
        )}
        {!hasLabel && canCreateLabel && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Action Needed
          </span>
        )}
      </div>

      {/* Label already purchased — show print / download / track actions */}
      {hasLabel && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Your shipping label is ready. Print or download it and attach it to your package before dropping it off.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary text-sm"
              onClick={() => window.open(labelUrl, '_blank')}
            >
              Print Label
            </button>
            <button
              type="button"
              className="btn-outline text-sm"
              onClick={handleDownloadLabel}
            >
              Download Label PDF
            </button>
            {trackingUrl && (
              <a href={trackingUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm">
                Track Package
              </a>
            )}
          </div>
          {(trackingNumber || carrier || service) && (
            <p className="text-xs text-slate-500">
              📦 {[carrier, service].filter(Boolean).join(' · ')}{trackingNumber ? `: ${trackingNumber}` : ''}
            </p>
          )}
        </div>
      )}

      {/* Order is PAID and no label yet — show rate-fetch form */}
      {!hasLabel && canCreateLabel && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            Enter package weight and dimensions to compare shipping rates, then purchase a label directly from here.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <input
              className="input"
              inputMode="decimal"
              value={weightOz}
              onChange={e => setWeightOz(e.target.value)}
              placeholder="Weight (oz)"
            />
            <input
              className="input"
              inputMode="decimal"
              value={lengthIn}
              onChange={e => setLengthIn(e.target.value)}
              placeholder="Length (in)"
            />
            <input
              className="input"
              inputMode="decimal"
              value={widthIn}
              onChange={e => setWidthIn(e.target.value)}
              placeholder="Width (in)"
            />
            <input
              className="input"
              inputMode="decimal"
              value={heightIn}
              onChange={e => setHeightIn(e.target.value)}
              placeholder="Height (in)"
            />
          </div>
          <button
            type="button"
            className="btn-primary text-sm"
            onClick={handleCreateLabel}
            disabled={loadingRates || loadingPurchase}
          >
            {loadingRates ? 'Loading rates…' : 'Get Shipping Rates'}
          </button>
          {rates.length > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold text-slate-600 mb-1">Select a shipping rate:</p>
              {rates.map(rate => (
                <label key={rate.id} className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`rate-${orderId}`}
                      value={rate.id}
                      checked={selectedRateId === rate.id}
                      onChange={() => setSelectedRateId(rate.id)}
                    />
                    <span>{rate.carrier} · {rate.service}</span>
                  </span>
                  <span className="text-slate-600">
                    ${rate.rate} {rate.currency}
                    {rate.deliveryDays !== null ? ` · ${rate.deliveryDays}d` : ''}
                  </span>
                </label>
              ))}
              <button
                type="button"
                className="btn-primary text-sm"
                disabled={!selectedRateId || loadingPurchase}
                onClick={handlePurchase}
              >
                {loadingPurchase ? 'Purchasing…' : 'Purchase Label'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Order not yet PAID — label unavailable */}
      {!hasLabel && !canCreateLabel && !hasTracking && (
        <p className="text-xs text-slate-500">
          Shipping label purchase is available once this order reaches <strong>PAID</strong> status.
        </p>
      )}

      {/* No Shippo label but has an external tracking number */}
      {!hasLabel && hasTracking && (
        <div className="flex flex-wrap gap-2 items-center">
          {trackingUrl && (
            <a href={trackingUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm">
              Track Package
            </a>
          )}
          <p className="text-xs text-slate-500">
            📦 {carrier ? `${carrier}: ` : ''}{trackingNumber}
          </p>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
      {success && <p className="text-xs text-green-700">{success}</p>}
    </div>
  );
}
