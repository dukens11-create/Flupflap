import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { classifyStripeError } from '@/lib/stripe';
import { createStripeConnectLinkForSeller } from '@/lib/stripe-connect';

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const link = await createStripeConnectLinkForSeller(session.user.id);
    return NextResponse.json(link);
  } catch (err: unknown) {
    const statusCode =
      typeof err === 'object' && err !== null && typeof (err as any).statusCode === 'number'
        ? (err as any).statusCode
        : null;
    const errorCode =
      typeof err === 'object' && err !== null && typeof (err as any).code === 'string'
        ? (err as any).code
        : null;
    if (statusCode) {
      return NextResponse.json(
        {
          error: (err as Error).message,
          code: errorCode ?? 'STRIPE_CONNECT_LINK_FAILED',
        },
        { status: statusCode },
      );
    }
    const classified = classifyStripeError(err);
    console.error('[stripe/connect/create-link POST] Error:', {
      reason: classified.reason,
      message: classified.message,
      code: classified.code,
      statusCode: classified.statusCode,
    });
    return NextResponse.json(
      {
        error: 'Unable to create Stripe onboarding link.',
        code: 'STRIPE_CONNECT_LINK_FAILED',
        reason: classified.reason,
      },
      { status: 500 },
    );
  }
}
