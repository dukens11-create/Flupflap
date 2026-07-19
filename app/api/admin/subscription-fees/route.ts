import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getMarketplaceSettings } from '@/lib/commission';
import { logError } from '@/lib/logger';

const MARKETPLACE_SETTINGS_ID = 1;

/**
 * POST /api/admin/subscription-fees
 *
 * Toggles seller monthly subscription fees on or off globally.
 * Body (form or JSON): { enabled: 'true' | 'false' | true | false }
 *
 * When enabled = false (FREE TIER):
 *   - All sellers can list and sell without a paid subscription.
 *   - Only the 7% transaction fee applies.
 *   - Subscription records are preserved for future re-activation.
 *
 * When enabled = true (fees re-enabled):
 *   - Sellers must have an active subscription to list items.
 *   - Normal Stripe billing resumes.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let enabled: boolean;
    const contentType = req.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const body = await req.json();
      enabled = body.enabled === true || body.enabled === 'true';
    } else {
      const form = await req.formData();
      enabled = form.get('enabled') === 'true';
    }

    // Ensure settings row exists before updating
    await getMarketplaceSettings();
    await prisma.marketplaceSettings.update({
      where: { id: MARKETPLACE_SETTINGS_ID },
      data: { sellerSubscriptionFeeEnabled: enabled },
    });

    const isJsonRequest = (req.headers.get('accept') ?? '').includes('application/json');
    if (isJsonRequest) {
      return NextResponse.json({
        ok: true,
        sellerSubscriptionFeeEnabled: enabled,
        message: enabled
          ? 'Seller subscription fees re-enabled. Sellers must now have an active subscription to list items.'
          : 'Seller subscription fees disabled (FREE TIER). All sellers can now list and sell for free.',
      });
    }

    const redirectUrl = new URL('/admin', req.url);
    redirectUrl.searchParams.set('subscriptionFees', enabled ? 'enabled' : 'disabled');
    return NextResponse.redirect(redirectUrl, 303);
  } catch (err) {
    logError('Failed to update seller subscription fee setting', err, {
      tag: 'admin/subscription-fees',
      action: 'post',
    });
    return NextResponse.json({ error: 'Failed to update subscription fee setting.' }, { status: 500 });
  }
}
