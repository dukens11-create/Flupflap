import { NextResponse } from 'next/server';
import { isConversionEventName } from '@/lib/conversion-events';
import { trackServerConversionEvent } from '@/lib/conversion-tracking-server';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { event?: unknown; payload?: unknown };
    const event = typeof body.event === 'string' ? body.event : '';
    if (!event || !isConversionEventName(event)) {
      return NextResponse.json({ error: 'Invalid conversion event.' }, { status: 400 });
    }

    const payload = body.payload && typeof body.payload === 'object'
      ? body.payload as Record<string, unknown>
      : undefined;

    await trackServerConversionEvent(event, payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[analytics/conversion POST]', err);
    return NextResponse.json({ error: 'Failed to record conversion event.' }, { status: 500 });
  }
}
