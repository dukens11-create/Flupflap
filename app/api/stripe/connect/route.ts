import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';

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

    // If onboarding is fully complete, send seller to the Stripe Express dashboard
    if (user.stripeAccountId && user.stripeOnboardingComplete) {
      const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);
      return NextResponse.redirect(loginLink.url);
    }

    // If the seller has a Stripe account but onboarding is not yet complete
    // (e.g. they abandoned the flow mid-way), generate a fresh onboarding link
    // so they can resume. createLoginLink is NOT valid for incomplete accounts.
    if (user.stripeAccountId && !user.stripeOnboardingComplete) {
      const accountLink = await stripe.accountLinks.create({
        account: user.stripeAccountId,
        refresh_url: `${appUrl}/api/stripe/connect`,
        return_url: `${appUrl}/seller?stripe=connected`,
        type: 'account_onboarding',
      });
      return NextResponse.redirect(accountLink.url);
    }

    // Create a new Stripe Connect Express account for this seller
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
  } catch (err: any) {
    console.error('[stripe/connect]', err);
    return NextResponse.redirect(new URL('/seller?stripe=error', appUrl));
  }
}
