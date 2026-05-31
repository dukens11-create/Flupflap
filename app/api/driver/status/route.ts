import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateDriverAvailabilityStatus } from '@/lib/driver-dashboard-store';

const statusSchema = z.object({
  status: z.enum(['online', 'offline']),
});

export async function POST(req: Request) {
  try {
    const parsed = statusSchema.parse(await req.json());
    return NextResponse.json(updateDriverAvailabilityStatus(parsed.status));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please provide a valid online/offline status.' }, { status: 400 });
    }

    console.error('[driver status POST]', error);
    return NextResponse.json({ error: 'Could not update status right now.' }, { status: 500 });
  }
}
