/**
 * GET /api/geo/zip?zip={postalCode}&country={countryCode}
 *
 * Server-side proxy for postal code → approximate latitude/longitude lookup.
 * Uses the free, no-auth-required zippopotam.us API.
 *
 * Returns: { lat: number, lng: number, city: string, state: string }
 * Errors:  { error: string } with 400 or 404 status
 *
 * Privacy note: only approximate city-level coordinates are returned.
 * These are used for distance display only — not for navigation.
 */

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zip = (searchParams.get('zip') ?? '').trim();
  const country = (searchParams.get('country') ?? 'us').trim().toLowerCase();

  if (!zip) {
    return NextResponse.json({ error: 'zip is required' }, { status: 400 });
  }
  // Sanitize: only alphanumeric and dash/space allowed in postal codes
  if (!/^[a-zA-Z0-9 \-]+$/.test(zip)) {
    return NextResponse.json({ error: 'Invalid zip format' }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.zippopotam.us/${encodeURIComponent(country)}/${encodeURIComponent(zip)}`,
      { next: { revalidate: 86400 } }, // cache for 24 h
    );

    if (res.status === 404) {
      return NextResponse.json({ error: 'Postal code not found' }, { status: 404 });
    }
    if (!res.ok) {
      return NextResponse.json({ error: 'Geocoding service unavailable' }, { status: 502 });
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) {
      return NextResponse.json({ error: 'No location data' }, { status: 404 });
    }

    return NextResponse.json({
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
      city: place['place name'] ?? '',
      state: place['state abbreviation'] ?? place.state ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'Geocoding request failed' }, { status: 502 });
  }
}
