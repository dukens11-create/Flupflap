import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { requireSeller } from '@/lib/require-seller';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';
import {
  describeReward,
  describeTrigger,
  formatDiscountValue,
  formatSalesPromotionDate,
  formatSalesPromotionStatus,
  getPromotionRouteLabel,
  isPromotionRouteKind,
  salesPromotionStatusTone,
  summarizeSalesPromotion,
  syncSalesPromotionStatuses,
  type PromotionRouteKind,
} from '@/lib/seller-promotions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ kind: string; id: string }> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) return { title: 'Promotion Details' };
  return { title: `${getPromotionRouteLabel(kind).slice(0, -1)} Details | Seller Promotions` };
}

export default async function SellerPromotionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { kind, id } = await params;
  if (!isPromotionRouteKind(kind)) notFound();
  const { sellerId } = await requireSeller();
  await syncSalesPromotionStatuses(sellerId);
  const sp = await searchParams;

  const promotion = await prisma.salesPromotion.findFirst({
    where: {
      id,
      sellerId,
      kind: kind === 'discounts' ? 'DISCOUNT' : 'OFFER',
    },
    include: {
      rewardProduct: {
        select: { id: true, title: true },
      },
    },
  });

  if (!promotion) notFound();

  const applicableProducts = promotion.applicableProductIds.length === 0
    ? []
    : await prisma.product.findMany({
      where: { sellerId, id: { in: promotion.applicableProductIds } },
      select: { id: true, title: true, priceCents: true },
      orderBy: { title: 'asc' },
    });

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-4">
        <Link href={`/seller/promotions/${kind}`} className="text-sm text-slate-500 hover:underline">← Back to {getPromotionRouteLabel(kind).toLowerCase()}</Link>
        <SellerPromotionsNav active={kind as PromotionRouteKind} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black text-slate-900">{promotion.name}</h1>
              <span className={`badge ${salesPromotionStatusTone(promotion.status)}`}>{formatSalesPromotionStatus(promotion.status)}</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">{promotion.description || summarizeSalesPromotion(promotion)}</p>
          </div>
          <Link href={`/seller/promotions/${kind}/${promotion.id}/edit`} className="btn-primary">Edit {kind === 'discounts' ? 'Discount' : 'Offer'}</Link>
        </div>
      </div>

      {sp.error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{sp.error}</div>}
      {sp.success && <div className="card border-green-200 bg-green-50 p-4 text-sm text-green-800">{sp.success}</div>}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Timing</p>
          <p className="mt-3 text-sm text-slate-700">Starts: {formatSalesPromotionDate(promotion.startsAt)}</p>
          <p className="mt-1 text-sm text-slate-700">Ends: {formatSalesPromotionDate(promotion.endsAt)}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Usage</p>
          <p className="mt-3 text-sm text-slate-700">{promotion.usageCount} used{promotion.totalUsageLimit ? ` / ${promotion.totalUsageLimit}` : ''}</p>
          <p className="mt-1 text-sm text-slate-700">Per customer: {promotion.perCustomerLimit ?? 'Unlimited'}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Performance</p>
          <p className="mt-3 text-sm text-slate-700">Conversions: {promotion.conversionCount}</p>
          <p className="mt-1 text-sm text-slate-700">Revenue impact: {dollars(promotion.revenueImpactCents)}</p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.4fr,1fr]">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-slate-900">Promotion details</h2>
          <dl className="mt-4 space-y-4 text-sm text-slate-600">
            <div>
              <dt className="font-semibold text-slate-800">Summary</dt>
              <dd className="mt-1">{summarizeSalesPromotion(promotion)}</dd>
            </div>
            {promotion.kind === 'DISCOUNT' ? (
              <>
                <div>
                  <dt className="font-semibold text-slate-800">Discount type</dt>
                  <dd className="mt-1">{promotion.discountType?.replace('_', ' ') ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-800">Discount value</dt>
                  <dd className="mt-1">{formatDiscountValue(promotion.discountType, promotion.discountValue)}</dd>
                </div>
              </>
            ) : (
              <>
                <div>
                  <dt className="font-semibold text-slate-800">Trigger</dt>
                  <dd className="mt-1">{describeTrigger(promotion.triggerType, promotion.triggerValue)}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-slate-800">Reward</dt>
                  <dd className="mt-1">{describeReward(promotion.rewardType, promotion.rewardProduct?.title, promotion.rewardQuantity)}</dd>
                </div>
              </>
            )}
          </dl>
        </div>

        <div className="card p-6">
          <h2 className="text-xl font-bold text-slate-900">Applicable listings</h2>
          {promotion.applicableProductIds.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">This promotion applies to all of your current listings.</p>
          ) : applicableProducts.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">The selected listings are no longer available.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {applicableProducts.map((product) => (
                <div key={product.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="font-semibold text-slate-900">{product.title}</p>
                  <p className="mt-1 text-sm text-slate-500">{dollars(product.priceCents)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
