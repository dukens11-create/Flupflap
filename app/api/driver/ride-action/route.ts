import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applyRideAction } from '@/lib/driver-dashboard-store';

const rideActionSchema = z.object({
  rideId: z.string().min(1),
  action: z.enum(['accept', 'reject']),
});

export async function POST(req: Request) {
  try {
    const parsed = rideActionSchema.parse(await req.json());
    return NextResponse.json(applyRideAction(parsed.rideId, parsed.action));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid ride action payload.' }, { status: 400 });
    }
    if (error instanceof Error && error.message.includes('not found')) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Error && error.message.includes('already handled')) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    console.error('[driver ride action POST]', error);
    return NextResponse.json({ error: 'Unable to process this ride request.' }, { status: 500 });
  }
}
