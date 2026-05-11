import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import { isSubscriptionActive } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import NewListingForm from './NewListingForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'List a New Item' };

export default async function SellerNewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  // Block restricted sellers from creating new listings
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
    redirect('/seller');
  }

  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId: session.user.id },
    select: { status: true },
  });
  if (!isSellerVerificationApproved(verification?.status)) {
    redirect('/seller?verification=required');
  }

  // Require an active subscription to list items
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
      console.error('[seller/new] subscription recovery sync failed:', err);
    }
  }

  if (!isSubscriptionActive(effectiveUser)) {
    redirect('/seller?subscribe=1');
  }

  return (
    <main className="max-w-xl mx-auto">
      <h1 className="text-3xl font-black mb-6">List a new item</h1>
      <NewListingForm />
    </main>
  );
}
