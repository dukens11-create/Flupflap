import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.info('[analytics/banner-click]', body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[analytics/banner-click POST]', err);
    return NextResponse.json({ error: 'Failed to track banner click.' }, { status: 500 });
  }
}
