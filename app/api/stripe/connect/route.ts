import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { appUrl, classifyStripeError } from '@/lib/stripe';
import { createStripeConnectLinkForSeller } from '@/lib/stripe-connect';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.redirect(new URL('/login', appUrl));
    }
    const link = await createStripeConnectLinkForSeller(session.user.id);
    return NextResponse.redirect(link.url);
  } catch (err: unknown) {
    const classified = classifyStripeError(err);
    console.error('[stripe/connect] Error:', {
      reason: classified.reason,
      message: classified.message,
      code: classified.code,
      statusCode: classified.statusCode,
    });
    return NextResponse.redirect(new URL(`/seller?stripe=error&reason=${classified.reason}`, appUrl));
  }
}
