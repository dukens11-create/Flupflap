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

  return (
    <div className="mt-3 space-y-2">
      {canCreateLabel && (
        <>
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
            disabled={loadingRates}
          >
            {loadingRates ? 'Loading rates…' : 'Create Label'}
          </button>
          {rates.length > 0 && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              {rates.map(rate => (
                <label key={rate.id} className="flex items-center justify-between gap-3 text-sm">
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
        </>
      )}

      {labelUrl && (
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Shipping Label</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-outline text-sm"
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
      {!labelUrl && trackingNumber && (
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
