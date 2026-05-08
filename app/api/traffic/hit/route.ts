import { NextResponse } from 'next/server';
import { trackVisitorHit } from '@/lib/traffic';

export async function POST(req: Request) {
  try {
    const forwardedFor = req.headers.get('x-forwarded-for');
    const ip = forwardedFor?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip');
    const userAgent = req.headers.get('user-agent');

    await trackVisitorHit({ ip, userAgent });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[traffic/hit POST]', err);
    return NextResponse.json({ error: 'Failed to track visitor.' }, { status: 500 });
  }
}
