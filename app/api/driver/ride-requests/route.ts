import { NextResponse } from 'next/server';
import {
  buildDriverRideSnapshot,
  enqueueSimulatedRideRequest,
  initializeDriverRideState,
  respondToRideRequest,
  updateDoNotDisturb,
  updateDriverAvailability,
  type DriverAvailabilityStatus,
  type RideRequestResponseAction,
} from '@/lib/driver-ride-requests';

export const dynamic = 'force-dynamic';

let driverRideState = initializeDriverRideState();

function createSnapshotResponse(now = Date.now()) {
  const result = buildDriverRideSnapshot(driverRideState, now);
  driverRideState = result.state;

  return NextResponse.json(result.snapshot, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

export async function GET() {
  return createSnapshotResponse();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    action?: 'respond' | 'status' | 'dnd' | 'simulate' | 'reset';
    requestId?: string;
    response?: RideRequestResponseAction;
    status?: DriverAvailabilityStatus;
    enabled?: boolean;
  } | null;

  switch (body?.action) {
    case 'respond': {
      if (!body.requestId || !body.response) {
        return NextResponse.json({ error: 'requestId and response are required.' }, { status: 400 });
      }
      driverRideState = respondToRideRequest(driverRideState, body.requestId, body.response);
      return createSnapshotResponse();
    }
    case 'status': {
      if (!body.status || !['ONLINE', 'OFFLINE', 'ON_TRIP'].includes(body.status)) {
        return NextResponse.json({ error: 'A valid driver status is required.' }, { status: 400 });
      }
      driverRideState = updateDriverAvailability(driverRideState, body.status);
      return createSnapshotResponse();
    }
    case 'dnd': {
      if (typeof body.enabled !== 'boolean') {
        return NextResponse.json({ error: 'A boolean enabled flag is required.' }, { status: 400 });
      }
      driverRideState = updateDoNotDisturb(driverRideState, body.enabled);
      return createSnapshotResponse();
    }
    case 'simulate': {
      driverRideState = enqueueSimulatedRideRequest(driverRideState);
      return createSnapshotResponse();
    }
    case 'reset': {
      driverRideState = initializeDriverRideState();
      return createSnapshotResponse();
    }
    default:
      return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
  }
}
