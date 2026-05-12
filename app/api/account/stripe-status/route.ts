import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/logger';

/**
 * GET /api/account/stripe-status
 *
 * Returns fresh Stripe onboarding status from the database (not the JWT,
 * which can be stale).  Used by client-side pages that cannot do a server
 * render with up-to-date DB data.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stripeAccountId: true, stripeOnboardingComplete: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      stripeAccountId: user.stripeAccountId,
      stripeOnboardingComplete: user.stripeOnboardingComplete,
      // Derived convenience fields for UI rendering
      stripeStatus: user.stripeOnboardingComplete
        ? 'complete'
        : user.stripeAccountId
          ? 'in_progress'
          : 'not_started',
    });
  } catch (err) {
    logError('Failed to fetch account Stripe status', err, { tag: 'account/stripe-status/GET' });
    return NextResponse.json({ error: 'Unable to load Stripe status right now.' }, { status: 500 });
  }
}
