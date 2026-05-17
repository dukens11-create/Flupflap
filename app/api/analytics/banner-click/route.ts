import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = {
      event: typeof body?.event === 'string' ? body.event : 'unknown_event',
      placement: typeof body?.placement === 'string' ? body.placement : 'unknown_placement',
      destination: typeof body?.destination === 'string' ? body.destination : 'unknown_destination',
    };
    console.info('[analytics/banner-click]', payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[analytics/banner-click POST]', err);
    return NextResponse.json({ error: 'Failed to track banner click.' }, { status: 500 });
  }
}
