import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';

/**
 * Returns true when a Stripe API error indicates the connected account does
 * not exist in the current Stripe mode — for example, a test-mode account ID
 * used after switching to live keys, or a previously-deleted account.
 */
function isStaleAccountError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const msg = typeof e.message === 'string' ? e.message : '';
  return (
    e.code === 'account_invalid' ||
    e.statusCode === 404 ||
    msg.includes('No such account')
  );
}

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
    let onboardingComplete: boolean = user.stripeOnboardingComplete;

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
        data: { stripeAccountId: null, stripeOnboardingComplete: false },
      });
      effectiveAccountId = null;
      onboardingComplete = false;
    };

    // If onboarding is fully complete, send seller to the Stripe Express dashboard.
    if (effectiveAccountId && onboardingComplete) {
      try {
        const loginLink = await stripe.accounts.createLoginLink(effectiveAccountId);
        return NextResponse.redirect(loginLink.url);
      } catch (err: unknown) {
        if (isStaleAccountError(err)) {
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
        if (isStaleAccountError(err)) {
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
      data: { stripeAccountId: account.id },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${appUrl}/api/stripe/connect`,
      return_url: `${appUrl}/seller?stripe=connected`,
      type: 'account_onboarding',
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err: unknown) {
    console.error('[stripe/connect]', err);
    return NextResponse.redirect(new URL('/seller?stripe=error', appUrl));
  }
}
