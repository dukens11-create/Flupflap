import { NextResponse } from 'next/server';
import { getDriverDashboardPayload } from '@/lib/driver-dashboard-store';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(getDriverDashboardPayload());
  } catch (error) {
    console.error('[driver dashboard GET]', error);
    return NextResponse.json({ error: 'Unable to load dashboard data right now.' }, { status: 500 });
  }
}
