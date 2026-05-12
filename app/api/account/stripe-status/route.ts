import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

/**
 * GET /api/account/stripe-status
 *
 * Returns fresh Stripe onboarding status from the database (not the JWT,
 * which can be stale).  Used by client-side pages that cannot do a server
 * render with up-to-date DB data.
 */
export async function GET() {
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
}
