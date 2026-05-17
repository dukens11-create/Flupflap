import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';
import PromoteForm from './PromoteForm';
import { expirePromotions, getPromotionPlans } from '@/lib/promotions';
import { isFreePromotionEligible } from '@/lib/free-promotion';
import { getMarketplaceSettings } from '@/lib/commission';

export const metadata: Metadata = { title: 'Promote Listing' };

export default async function SellerPromotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');

  // Block restricted sellers
  const dbUser = await prisma.user.findUnique({
    where: { id: sellerId },
    select: {
      sellerStatus: true,
      hasFreePromotion: true,
      freePromotionStart: true,
      freePromotionEnd: true,
      promotionCredits: true,
      freePromotionGrantedAt: true,
      freePromotionExpiresAt: true,
    },
  });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
    redirect('/seller');
  }

  const { id } = await params;
  const settings = await getMarketplaceSettings();
  const freePromotionEligible = settings.freePromotionEnabled && !!dbUser && isFreePromotionEligible(dbUser);
  const hasPromotionCredits = !freePromotionEligible && (dbUser?.promotionCredits ?? 0) > 0;
  const product = await prisma.product.findUnique({ where: { id } });

  if (!product || product.sellerId !== sellerId) {
    redirect('/seller');
  }

  if (product.status !== 'APPROVED' && product.status !== 'ACTIVE') {
    return (
      <main className="max-w-xl mx-auto">
        <div className="mb-6">
          <Link href="/seller" className="text-sm text-slate-500 hover:underline">← Back to dashboard</Link>
        </div>
        <div className="card p-8 text-center">
          <p className="text-4xl mb-4">⏳</p>
          <h1 className="text-2xl font-black mb-2">Approval required</h1>
          <p className="text-slate-500 mb-6">
            <strong>{product.title}</strong> must be approved by an admin before it can be promoted.
          </p>
          <p className="text-sm text-slate-400">Current status: <span className="font-semibold">{product.status}</span></p>
          <Link href="/seller" className="btn-outline mt-6">Back to dashboard</Link>
        </div>
      </main>
    );
  }

  // Check for an existing active promotion
  await expirePromotions();
  const now = new Date();
  const [activePromotion, plans] = await Promise.all([
    prisma.promotion.findFirst({
      where: { productId: id, status: 'ACTIVE', expiresAt: { gt: now } },
    }),
    getPromotionPlans(),
  ]);

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <main className="max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/seller" className="text-sm text-slate-500 hover:underline">← Back to dashboard</Link>
      </div>

      <h1 className="text-3xl font-black mb-2">Promote listing</h1>
      <p className="text-slate-500 text-sm mb-6">
        Boosted listings appear higher in search results with a visible Sponsored badge.
      </p>

      {/* Product preview */}
      <div className="card p-4 mb-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.title} className="h-16 w-16 flex-shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{product.title}</p>
          <p className="text-sm text-slate-500">{product.condition} · {product.category} · {dollars(product.priceCents)}</p>
        </div>
      </div>

      {activePromotion ? (
        <div className="card p-6 bg-green-50 border-green-200 text-center">
          <p className="text-3xl mb-3">⭐</p>
          <p className="font-bold text-green-800 text-lg">Boost is active</p>
          <p className="text-sm text-green-700 mt-1">
            This listing is sponsored until <strong>{activePromotion.expiresAt ? formatDate(activePromotion.expiresAt) : 'an upcoming date'}</strong>.
          </p>
          <Link href="/seller" className="btn-outline mt-4">Back to dashboard</Link>
        </div>
      ) : (
        <>
          <h2 className="text-lg font-bold mb-3">Choose a promotion package</h2>
          {freePromotionEligible && (dbUser?.freePromotionEnd ?? dbUser?.freePromotionExpiresAt) && (
            <div className="card p-4 mb-4 bg-blue-50 border-blue-200 text-blue-900 text-sm">
              Free Promotion Active: expires on {(dbUser.freePromotionEnd ?? dbUser.freePromotionExpiresAt)?.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
            </div>
          )}
          {hasPromotionCredits && (
            <div className="card p-4 mb-4 bg-green-50 border-green-200 text-green-900 text-sm">
              {dbUser?.promotionCredits} promotion credit{dbUser?.promotionCredits === 1 ? '' : 's'} available.
            </div>
          )}
          <PromoteForm
            productId={id}
            plans={plans}
            freePromotionEligible={freePromotionEligible}
            hasPromotionCredits={hasPromotionCredits}
          />
        </>
      )}
    </main>
  );
}
