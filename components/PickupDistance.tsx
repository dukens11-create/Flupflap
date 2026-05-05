"use client";

import { useState, useEffect } from 'react';

interface Props {
  sellerLat: number;
  sellerLng: number;
  pickupCity: string;
  pickupState: string;
}

/** Haversine distance between two lat/lng points, in miles. */
function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function PickupDistance({ sellerLat, sellerLng, pickupCity, pickupState }: Props) {
  const [distance, setDistance] = useState<number | null>(null);
  const [zip, setZip] = useState('');
  const [zipInput, setZipInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [geoTried, setGeoTried] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);

  // Try browser geolocation on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoTried(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineMiles(pos.coords.latitude, pos.coords.longitude, sellerLat, sellerLng);
        setDistance(d);
        setGeoTried(true);
      },
      () => {
        // Location access denied or error — prompt ZIP entry
        setGeoTried(true);
        setGeoDenied(true);
      },
      { timeout: 5000 },
    );
  }, [sellerLat, sellerLng]);

  async function lookupZip(e: React.FormEvent) {
    e.preventDefault();
    if (!zipInput.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/geo/zip?zip=${encodeURIComponent(zipInput.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'ZIP not found.');
      } else {
        const d = haversineMiles(data.lat, data.lng, sellerLat, sellerLng);
        setDistance(d);
        setZip(zipInput.trim());
        setError('');
      }
    } catch {
      setError('Lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const formatMiles = (m: number) =>
    m < 1 ? 'Less than 1 mile away' : `${m.toFixed(1)} miles away`;

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span>📍</span>
        <span>
          Pickup in <strong>{pickupCity}, {pickupState}</strong>
        </span>
      </div>

      {distance !== null ? (
        <p className="text-sm font-semibold text-green-700">
          🚗 {formatMiles(distance)}
          {zip && <span className="text-slate-400 font-normal"> (from ZIP {zip})</span>}
        </p>
      ) : (
        geoTried && (
          <div>
            {geoDenied && (
              <p className="text-xs text-slate-500 mb-1">
                📍 Location access was denied. Enter your ZIP code to see the distance:
              </p>
            )}
            <form onSubmit={lookupZip} className="flex gap-2 items-center">
              <input
                type="text"
                value={zipInput}
                onChange={(e) => setZipInput(e.target.value)}
                placeholder="5-digit ZIP"
                maxLength={5}
                className="input max-w-[160px] text-sm py-1"
              />
              <button
                type="submit"
                disabled={loading}
                className="btn-outline text-xs py-1 px-3"
              >
                {loading ? '…' : 'Get distance'}
              </button>
            </form>
          </div>
        )
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
