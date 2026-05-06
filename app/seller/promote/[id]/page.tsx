import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';
import PromoteForm from './PromoteForm';

export const metadata: Metadata = { title: 'Promote Listing' };

export default async function SellerPromotePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ action?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  // Block restricted sellers
  const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
    redirect('/seller');
  }

  const { id } = await params;
  const { action } = await searchParams;
  const product = await prisma.product.findUnique({ where: { id } });

  if (!product || product.sellerId !== session.user.id) {
    redirect('/seller');
  }

  if (product.status !== 'APPROVED') {
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

  const now = new Date();

  // Find the currently running active promotion (started in the past, not yet expired)
  const activePromotion = await prisma.promotion.findFirst({
    where: {
      productId: id,
      sellerId: session.user.id,
      status: 'ACTIVE',
      startsAt: { lte: now },
      expiresAt: { gt: now },
    },
    orderBy: { expiresAt: 'desc' },
  });

  // Find the most recent expired promotion (for renew flow)
  const lastExpiredPromotion = activePromotion ? null : await prisma.promotion.findFirst({
    where: {
      productId: id,
      sellerId: session.user.id,
      status: 'EXPIRED',
    },
    orderBy: { expiresAt: 'desc' },
  });

  // Check if there's already a paid/scheduled renewal queued to start after the active promo
  const scheduledRenewal = activePromotion ? await prisma.promotion.findFirst({
    where: {
      productId: id,
      sellerId: session.user.id,
      status: 'ACTIVE',
      startsAt: { gt: now },
    },
    orderBy: { startsAt: 'asc' },
  }) : null;

  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // Determine the mode: URL param takes precedence, then infer from state
  let mode: 'new' | 'renew' | 'change' =
    action === 'change' && activePromotion ? 'change' :
    action === 'renew' ? 'renew' :
    activePromotion ? 'change' :  // default for active state
    lastExpiredPromotion ? 'renew' :
    'new';

  // If the seller explicitly wants to change but there's no active promo, fall back to renew/new
  if (mode === 'change' && !activePromotion) {
    mode = lastExpiredPromotion ? 'renew' : 'new';
  }

  return (
    <main className="max-w-xl mx-auto">
      <div className="mb-6">
        <Link href="/seller" className="text-sm text-slate-500 hover:underline">← Back to dashboard</Link>
      </div>

      <h1 className="text-3xl font-black mb-2">Promote listing</h1>
      <p className="text-slate-500 text-sm mb-6">
        Featured listings appear with a ⭐ badge and are highlighted across the marketplace.
      </p>

      {/* Product preview */}
      <div className="card p-4 mb-6 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={product.imageUrl} alt={product.title} className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">{product.title}</p>
          <p className="text-sm text-slate-500">{product.condition} · {product.category} · {dollars(product.priceCents)}</p>
        </div>
      </div>

      {activePromotion && (
        <>
          {/* Active promotion status */}
          <div className="card p-5 bg-green-50 border-green-200 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">⭐</span>
              <p className="font-bold text-green-800">Active promotion</p>
            </div>
            <p className="text-sm text-green-700">
              This listing is featured until{' '}
              <strong>{activePromotion.expiresAt ? formatDate(activePromotion.expiresAt) : '—'}</strong>
              {' '}({activePromotion.durationDays}-day plan).
            </p>
            {scheduledRenewal && (
              <p className="text-xs text-green-600 mt-2">
                🔄 Renewal scheduled to begin {scheduledRenewal.startsAt ? formatDate(scheduledRenewal.startsAt) : '—'} for {scheduledRenewal.durationDays} days.
              </p>
            )}
          </div>

          {!scheduledRenewal && (
            <>
              {/* Tab-like navigation between change and renew early */}
              <div className="flex gap-2 mb-5">
                <Link
                  href={`/seller/promote/${id}?action=change`}
                  className={`flex-1 text-center text-sm font-semibold py-2 px-3 rounded-lg border transition-colors ${
                    mode === 'change'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ⚡ Change Duration
                </Link>
                <Link
                  href={`/seller/promote/${id}?action=renew`}
                  className={`flex-1 text-center text-sm font-semibold py-2 px-3 rounded-lg border transition-colors ${
                    mode === 'renew'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  🔄 Renew Early
                </Link>
              </div>

              {mode === 'change' && (
                <>
                  <h2 className="text-lg font-bold mb-1">Change promotion duration</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Select a new duration. Your current promotion ends immediately and the new one begins.
                  </p>
                  <PromoteForm productId={id} mode="change" />
                </>
              )}

              {mode === 'renew' && (
                <>
                  <h2 className="text-lg font-bold mb-1">Renew promotion early</h2>
                  <p className="text-sm text-slate-500 mb-4">
                    Pay now and your next promotion begins automatically when the current one expires.
                  </p>
                  <PromoteForm
                    productId={id}
                    mode="renew"
                    scheduledStart={activePromotion.expiresAt?.toISOString() ?? null}
                  />
                </>
              )}
            </>
          )}

          {scheduledRenewal && (
            <p className="text-sm text-slate-500 text-center mt-4">
              You already have a renewal scheduled. No further action is needed.
            </p>
          )}
        </>
      )}

      {!activePromotion && lastExpiredPromotion && (
        <>
          <div className="card p-4 bg-slate-50 border-slate-200 mb-6 text-sm text-slate-600">
            <p>
              Your last promotion expired on{' '}
              <strong>{lastExpiredPromotion.expiresAt ? formatDate(lastExpiredPromotion.expiresAt) : '—'}</strong>.
              Renew it to get featured again.
            </p>
          </div>
          <h2 className="text-lg font-bold mb-3">Renew promotion</h2>
          <PromoteForm productId={id} mode="renew" />
        </>
      )}

      {!activePromotion && !lastExpiredPromotion && (
        <>
          <h2 className="text-lg font-bold mb-3">Choose a promotion package</h2>
          <PromoteForm productId={id} mode="new" />
        </>
      )}
    </main>
  );
}
