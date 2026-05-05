import { serverBaseUrl } from './server-url';

/**
 * Geocodes a US ZIP code to lat/lng using the internal /api/geo/zip proxy.
 * Returns null if geocoding fails or the ZIP is invalid.
 */
export async function geocodeZip(postalCode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${serverBaseUrl()}/api/geo/zip?zip=${encodeURIComponent(postalCode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.lat === 'number' && typeof data.lng === 'number') return data;
    return null;
  } catch {
    return null;
  }
}
