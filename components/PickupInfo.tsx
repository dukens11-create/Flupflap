"use client";
import { useState, useEffect } from 'react';
import { haversineDistanceMiles } from '@/lib/pickup';

interface Props {
  pickupCity: string | null;
  pickupState: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
}

export default function PickupInfo({ pickupCity, pickupState, pickupLat, pickupLng }: Props) {
  const [distance, setDistance] = useState<number | null>(null);
  const [geoError, setGeoError] = useState(false);

  useEffect(() => {
    if (pickupLat == null || pickupLng == null) return;
    if (!navigator.geolocation) {
      setGeoError(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const d = haversineDistanceMiles(
          pos.coords.latitude,
          pos.coords.longitude,
          pickupLat,
          pickupLng,
        );
        setDistance(d);
      },
      () => {
        setGeoError(true);
      },
      { timeout: 5000 },
    );
  }, [pickupLat, pickupLng]);

  const location = [pickupCity, pickupState].filter(Boolean).join(', ');

  return (
    <div className="flex items-start gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-3 py-2">
      <span className="text-base">📍</span>
      <div>
        <span className="font-semibold">Pickup available</span>
        {location && (
          <span className="text-slate-600"> · {location}</span>
        )}
        {distance !== null && (
          <span className="text-slate-500" aria-label={`Distance from you: approximately ${distance < 1 ? 'less than 1' : distance.toFixed(1)} miles`}>
            {' '}· ~{distance < 1 ? '< 1' : distance.toFixed(1)} mi from you
          </span>
        )}
        {geoError && pickupLat !== null && (
          <span className="text-slate-400"> · allow location for distance</span>
        )}
      </div>
    </div>
  );
}
