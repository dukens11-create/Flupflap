import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.redirect(new URL('/login', appUrl));
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) return NextResponse.redirect(new URL('/login', appUrl));

    // Block restricted sellers from connecting/accessing Stripe payouts
    if (user.sellerStatus === 'SUSPENDED' || user.sellerStatus === 'BANNED') {
      return NextResponse.redirect(new URL('/seller', appUrl));
    }

    // Track effective state — may be reset if a stale/invalid account is detected.
    let effectiveAccountId: string | null = user.stripeAccountId;
    let effectiveAccountMode: string | null = user.stripeAccountMode;
    let onboardingComplete: boolean = user.stripeOnboardingComplete;
    const currentMode = getCurrentStripeMode();

    /**
     * Clears a stale Stripe connected-account ID from the DB and resets the
     * local tracking variables so the code below falls through to create a
     * fresh account.
     */
    const clearStaleAccount = async () => {
      console.warn(
        `[stripe/connect] stale/invalid connected account detected ` +
        `(accountId=${effectiveAccountId}). Clearing and will recreate.`,
      );
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
      });
      effectiveAccountId = null;
      effectiveAccountMode = null;
      onboardingComplete = false;
    };

    // Proactively invalidate connected accounts saved under a different Stripe mode.
    if (effectiveAccountId && effectiveAccountMode && currentMode && effectiveAccountMode !== currentMode) {
      await clearStaleAccount();
    }

    // If onboarding is fully complete, send seller to the Stripe Express dashboard.
    if (effectiveAccountId && onboardingComplete) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(effectiveAccountId);
        return NextResponse.redirect(loginLink.url);
      } catch (err: unknown) {
        if (classifyStripeError(err).reason === 'stale_account') {
          // Account was created in a different Stripe mode (e.g. test → live).
          // Clear it and fall through to create a fresh account below.
          await clearStaleAccount();
        } else {
          throw err;
        }
      }
    }

    // If the seller has a Stripe account but onboarding is not yet complete
    // (e.g. they abandoned the flow mid-way, or the saved account belongs to a
    // different Stripe mode), generate a fresh onboarding link or recover by
    // clearing the stale record and creating a new account.
    if (effectiveAccountId && !onboardingComplete) {
      try {
        // Verify the account exists in the current Stripe mode before using it.
        // This detects test-mode account IDs when the app is now using live keys.
        await stripe.accounts.retrieve(effectiveAccountId);

        const accountLink = await stripe.accountLinks.create({
          account: effectiveAccountId,
          refresh_url: `${appUrl}/api/stripe/connect`,
          return_url: `${appUrl}/seller?stripe=connected`,
          type: 'account_onboarding',
        });
        return NextResponse.redirect(accountLink.url);
      } catch (err: unknown) {
        if (classifyStripeError(err).reason === 'stale_account') {
          // Account not found in this Stripe mode — clear it and fall through
          // to create a fresh account below.
          await clearStaleAccount();
        } else {
          throw err;
        }
      }
    }

    // Create a new Stripe Connect Express account for this seller.
    const account = await stripe.accounts.create({ type: 'express' });

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeAccountId: account.id,
        stripeAccountMode: currentMode,
      },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${appUrl}/api/stripe/connect`,
      return_url: `${appUrl}/seller?stripe=connected`,
      type: 'account_onboarding',
    });

    return NextResponse.redirect(accountLink.url);
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
