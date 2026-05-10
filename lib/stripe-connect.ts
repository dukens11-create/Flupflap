import { prisma } from '@/lib/db';
import { appUrl, classifyStripeError, getCurrentStripeMode, stripe } from '@/lib/stripe';

export type StripeConnectLinkResult = {
  url: string;
  stripeAccountId: string;
  stripeConnectStatus: 'connected' | 'in_progress';
  stripeConnectCompletedAt: string | null;
};

export async function createStripeConnectLinkForSeller(sellerId: string): Promise<StripeConnectLinkResult> {
  const user = await prisma.user.findUnique({ where: { id: sellerId } });
  if (!user) {
    throw Object.assign(new Error('Seller not found.'), {
      code: 'SELLER_NOT_FOUND',
      statusCode: 404,
    });
  }
  if (user.sellerStatus === 'SUSPENDED' || user.sellerStatus === 'BANNED') {
    throw Object.assign(new Error('Seller account is restricted.'), {
      code: 'SELLER_RESTRICTED',
      statusCode: 403,
    });
  }

  let effectiveAccountId: string | null = user.stripeAccountId;
  let effectiveAccountMode: string | null = user.stripeAccountMode;
  let onboardingComplete = user.stripeOnboardingComplete;
  const currentMode = getCurrentStripeMode();

  const clearStaleAccount = async () => {
    await prisma.user.update({
      where: { id: user.id },
      data: { stripeAccountId: null, stripeAccountMode: null, stripeOnboardingComplete: false },
    });
    effectiveAccountId = null;
    effectiveAccountMode = null;
    onboardingComplete = false;
  };

  if (effectiveAccountId && effectiveAccountMode && currentMode && effectiveAccountMode !== currentMode) {
    await clearStaleAccount();
  }

  if (effectiveAccountId && onboardingComplete) {
    try {
      const loginLink = await stripe.accounts.createLoginLink(effectiveAccountId);
      return {
        url: loginLink.url,
        stripeAccountId: effectiveAccountId,
        stripeConnectStatus: 'connected',
        stripeConnectCompletedAt: null,
      };
    } catch (err: unknown) {
      if (classifyStripeError(err).reason === 'stale_account') {
        await clearStaleAccount();
      } else {
        throw err;
      }
    }
  }

  if (effectiveAccountId && !onboardingComplete) {
    try {
      await stripe.accounts.retrieve(effectiveAccountId);
      const accountLink = await stripe.accountLinks.create({
        account: effectiveAccountId,
        refresh_url: `${appUrl}/api/stripe/connect`,
        return_url: `${appUrl}/seller?stripe=connected`,
        type: 'account_onboarding',
      });
      return {
        url: accountLink.url,
        stripeAccountId: effectiveAccountId,
        stripeConnectStatus: 'in_progress',
        stripeConnectCompletedAt: null,
      };
    } catch (err: unknown) {
      if (classifyStripeError(err).reason === 'stale_account') {
        await clearStaleAccount();
      } else {
        throw err;
      }
    }
  }

  const account = await stripe.accounts.create({ type: 'express' });
  await prisma.user.update({
    where: { id: user.id },
    data: {
      stripeAccountId: account.id,
      stripeAccountMode: currentMode,
      stripeOnboardingComplete: false,
    },
  });

  const accountLink = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${appUrl}/api/stripe/connect`,
    return_url: `${appUrl}/seller?stripe=connected`,
    type: 'account_onboarding',
  });

  return {
    url: accountLink.url,
    stripeAccountId: account.id,
    stripeConnectStatus: 'in_progress',
    stripeConnectCompletedAt: null,
  };
}
