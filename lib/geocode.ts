/**
 * Lightweight geocoding helper using the Nominatim OpenStreetMap API.
 *
 * Nominatim is free and requires no API key. It returns city-level coordinates
 * for a given city/state/postal code, which are safe to expose to buyers
 * because they represent an approximate area rather than an exact address.
 *
 * Usage limits: max 1 request/second — acceptable for seller product saves.
 * See: https://nominatim.org/release-docs/latest/api/Search/
 *
 * Returns null if geocoding fails or the address is not found.
 */

export interface GeoCoords {
  lat: number;
  lng: number;
}

/**
 * Geocode a city/state/postalCode to approximate coordinates.
 * Always passes `city + state + country` to get a city-level result
 * rather than an exact street address.
 */
export async function geocodeCity(
  city: string,
  state: string,
  postalCode?: string,
  country = 'US',
): Promise<GeoCoords | null> {
  try {
    const q = [city.trim(), state.trim(), postalCode?.trim(), country]
      .filter(Boolean)
      .join(', ');

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('addressdetails', '0');

    const res = await fetch(url.toString(), {
      headers: {
        // Nominatim policy requires a meaningful User-Agent
        'User-Agent': 'FlupFlap-Marketplace/1.0 (contact@flupflap.example.com)',
      },
      // City-level coordinates change rarely; cache for 24 hours to respect
      // Nominatim rate limits while keeping data reasonably fresh.
      next: { revalidate: 86400 },
    });

    if (!res.ok) return null;

    const data = await res.json() as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;

    const lat = parseFloat(data[0].lat);
    const lng = parseFloat(data[0].lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return null;

    return { lat, lng };
  } catch {
    return null;
  }
}
