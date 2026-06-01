import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';

export const dynamic = 'force-dynamic';

export interface RideResponseBody {
  requestId: string;
  action: 'accept' | 'reject';
  reason?: string;
  responseTimeMs?: number;
}

export interface RideResponseResult {
  success: boolean;
  rideId?: string;
  message: string;
}

/**
 * POST /api/driver/rides
 * Body: { requestId, action: 'accept' | 'reject', reason?, responseTimeMs? }
 *
 * Accepts or rejects an incoming ride request.
 * Updates driver status and (in production) notifies the passenger.
 */
export async function POST(req: NextRequest): Promise<NextResponse<RideResponseResult | { error: string }>> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: RideResponseBody;
  try {
    body = (await req.json()) as RideResponseBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { requestId, action, reason, responseTimeMs } = body;

  if (!requestId || !action) {
    return NextResponse.json(
      { error: 'requestId and action are required' },
      { status: 400 },
    );
  }

  if (action !== 'accept' && action !== 'reject') {
    return NextResponse.json(
      { error: 'action must be "accept" or "reject"' },
      { status: 400 },
    );
  }

  // Log the response (extend this section to write to DB / notify passenger)
  console.info('[driver/rides] ride response', {
    driverId: session.user.id,
    requestId,
    action,
    reason: reason ?? null,
    responseTimeMs: responseTimeMs ?? null,
    at: new Date().toISOString(),
  });

  // ── Accept path ─────────────────────────────────────────────────────────────
  if (action === 'accept') {
    // TODO (production): assign the ride to this driver in the DB,
    // update driver status to BUSY, push notification to passenger.
    return NextResponse.json(
      { success: true, rideId: requestId, message: 'Ride accepted' },
      { status: 200 },
    );
  }

  // ── Reject path ─────────────────────────────────────────────────────────────
  // TODO (production): release the ride for re-dispatch, log reason.
  return NextResponse.json(
    { success: true, rideId: requestId, message: 'Ride declined' },
    { status: 200 },
  );
}
