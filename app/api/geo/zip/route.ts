/**
 * GET /api/geo/zip?zip=12345
 *
 * Geocodes a US ZIP code to lat/lng using the free zippopotam.us API.
 * No API key required. Responses are cached for 24 hours.
 *
 * Returns: { lat: number; lng: number; city: string; state: string }
 */

import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const zip = searchParams.get('zip')?.replace(/\D/g, '');

  if (!zip || zip.length !== 5) {
    return NextResponse.json({ error: 'Please provide a valid 5-digit US ZIP code.' }, { status: 400 });
  }

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      next: { revalidate: 86400 }, // cache 24 h
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'ZIP code not found.' }, { status: 404 });
    }

    const data = await res.json();
    const place = data.places?.[0];
    if (!place) {
      return NextResponse.json({ error: 'ZIP code not found.' }, { status: 404 });
    }

    return NextResponse.json({
      lat: parseFloat(place.latitude),
      lng: parseFloat(place.longitude),
      city: place['place name'],
      state: place['state abbreviation'],
    });
  } catch {
    return NextResponse.json({ error: 'Geocoding failed.' }, { status: 500 });
  }
}
