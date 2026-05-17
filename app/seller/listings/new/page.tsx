import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import SellerListingsSectionNav from '@/components/SellerListingsSectionNav';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isSubscriptionActive } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import NewListingForm from '../../new/NewListingForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'List Item' };

export default async function SellerListingsNewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');

  const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
    redirect('/seller');
  }

  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId },
    select: { status: true },
  });
  if (!isSellerVerificationApproved(verification?.status)) {
    redirect('/seller?verification=required');
  }

  if (!dbUser) {
    redirect('/seller?subscribe=1');
  }

  let effectiveUser = dbUser;
  if (!isSubscriptionActive(effectiveUser) && effectiveUser.stripeCustomerId) {
    try {
      const synced = await syncSellerSubscriptionFromStripe(effectiveUser.id);
      if (synced) {
        effectiveUser = {
          ...effectiveUser,
          ...synced,
        };
      }
    } catch (err) {
      console.error('[seller/listings/new] subscription recovery sync failed:', err);
    }
  }

  if (!isSubscriptionActive(effectiveUser)) {
    redirect('/seller?subscribe=1');
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <SellerListingsSectionNav />
      <section className="space-y-2">
        <h1 className="text-3xl font-black text-slate-900">List Item</h1>
        <p className="text-sm text-slate-600">
          Create a new listing from the focused My Listings workflow.
        </p>
      </section>
      <div className="max-w-xl">
        <NewListingForm />
      </div>
    </main>
  );
}
