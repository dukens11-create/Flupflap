"use client";
/**
 * PickupDistance
 *
 * Displays local pickup availability and, when the buyer grants location
 * permission (or the browser geolocation API is available), shows the
 * approximate distance between the buyer and the seller's pickup location.
 *
 * Privacy: only the seller's city/state is shown publicly. The postal code
 * is used server-side (via /api/geo/zip) to get approximate coordinates for
 * distance calculation only — the exact coordinates are never displayed.
 */

import { useState, useCallback } from 'react';

interface Props {
  pickupCity: string;
  pickupState: string;
  pickupPostalCode: string;
  country?: string; // ISO 2-letter country code, defaults to "us"
}

/** Feet per mile — used to display sub-mile distances. */
const FEET_PER_MILE = 5280;

/** Haversine great-circle distance in miles. */
function haversineDistanceMiles(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
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

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; miles: number }
  | { kind: 'error'; message: string };

export default function PickupDistance({
  pickupCity,
  pickupState,
  pickupPostalCode,
  country = 'us',
}: Props) {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const calculateDistance = useCallback(() => {
    if (!navigator.geolocation) {
      setStatus({ kind: 'error', message: 'Geolocation is not supported by your browser.' });
      return;
    }

    setStatus({ kind: 'loading' });

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const buyerLat = pos.coords.latitude;
        const buyerLng = pos.coords.longitude;

        try {
          const res = await fetch(
            `/api/geo/zip?zip=${encodeURIComponent(pickupPostalCode)}&country=${encodeURIComponent(country)}`,
          );
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
            setStatus({ kind: 'error', message: error ?? 'Could not find seller location.' });
            return;
          }
          const { lat: sellerLat, lng: sellerLng } = await res.json();
          const miles = haversineDistanceMiles(buyerLat, buyerLng, sellerLat, sellerLng);
          setStatus({ kind: 'done', miles });
        } catch {
          setStatus({ kind: 'error', message: 'Distance calculation failed.' });
        }
      },
      (err) => {
        let message = 'Could not get your location.';
        if (err.code === err.PERMISSION_DENIED) {
          message = 'Location permission denied. Allow location access to see distance.';
        }
        setStatus({ kind: 'error', message });
      },
      { timeout: 10_000 },
    );
  }, [pickupPostalCode, country]);

  return (
    <div className="mt-3 p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
      <div className="flex items-center gap-2 font-semibold text-green-800">
        <span>🏠</span>
        <span>Local pickup available</span>
      </div>
      <p className="text-green-700 mt-0.5">
        Located in{' '}
        <span className="font-medium">
          {pickupCity}, {pickupState}
        </span>
      </p>

      {status.kind === 'idle' && (
        <button
          onClick={calculateDistance}
          className="mt-2 text-xs text-green-700 underline underline-offset-2 hover:text-green-900"
        >
          Show distance from me
        </button>
      )}

      {status.kind === 'loading' && (
        <p className="mt-2 text-xs text-green-600 animate-pulse">Calculating distance…</p>
      )}

      {status.kind === 'done' && (
        <p className="mt-2 text-xs font-medium text-green-800">
          ~{status.miles < 1
            ? `${(status.miles * FEET_PER_MILE).toFixed(0)} ft`
            : `${status.miles.toFixed(1)} miles`}{' '}
          from your location
          <span className="text-green-600 font-normal"> (approximate)</span>
        </p>
      )}

      {status.kind === 'error' && (
        <p className="mt-2 text-xs text-amber-700">{status.message}</p>
      )}
    </div>
  );
}
