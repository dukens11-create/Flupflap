import { NextResponse } from 'next/server';
import type { StripeErrorReason } from '@/lib/stripe';

/**
 * Maps Stripe failure categories to buyer-safe checkout API responses.
 */
export function checkoutErrorResponse(reason: StripeErrorReason) {
  if (reason === 'stale_account') {
    return NextResponse.json(
      { error: 'Seller payout account needs reconnection. Please try again shortly.', code: 'seller_reconnect_required' },
      { status: 503 },
    );
  }
  if (reason === 'invalid_key' || reason === 'platform_incomplete') {
    return NextResponse.json(
      { error: 'Payments are temporarily unavailable due to platform Stripe configuration.', code: 'platform_incomplete' },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: 'Checkout is temporarily unavailable. Please try again later.', code: 'stripe_unavailable' },
    { status: 503 },
  );
}
