import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';
import { requireSeller } from '@/lib/require-seller';
import {
  formatSalesPromotionDate,
  formatSalesPromotionStatus,
  getPromotionRouteLabel,
  isPromotionRouteKind,
  listSellerPromotions,
  salesPromotionStatusTone,
  summarizeSalesPromotion,
  syncSalesPromotionStatuses,
} from '@/lib/seller-promotions';

type SearchParams = Promise<{ status?: string; error?: string; success?: string }>;

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) {
    return { title: 'Seller Promotions' };
  }
  return { title: `${getPromotionRouteLabel(kind)} | Seller Promotions` };
}

export default async function SellerPromotionListPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: SearchParams;
}) {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) notFound();
  const { sellerId } = await requireSeller();
  const sp = await searchParams;
  await syncSalesPromotionStatuses(sellerId);

  const promotions = await listSellerPromotions(sellerId, kind);
  const validStatuses = ['DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'];
  const statusFilter = validStatuses.includes(sp.status ?? '') ? sp.status! : 'ALL';
  const filteredPromotions = statusFilter === 'ALL'
    ? promotions
    : promotions.filter((promotion) => promotion.status === statusFilter);

  const counts = validStatuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = promotions.filter((promotion) => promotion.status === status).length;
    return acc;
  }, {});

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-4">
        <Link href="/seller/promotions" className="text-sm text-slate-500 hover:underline">← Back to promotions</Link>
        <SellerPromotionsNav active={kind} />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{getPromotionRouteLabel(kind)}</h1>
            <p className="mt-2 text-sm text-slate-500">
              Focused {kind === 'discounts' ? 'discount management with lifecycle visibility and listing-level targeting.' : 'offer management with trigger and reward details for free-gift promotions.'}
            </p>
          </div>
          <Link href={`/seller/promotions/${kind}/new`} className="btn-primary">New {kind === 'discounts' ? 'Discount' : 'Offer'}</Link>
        </div>
      </div>

      {sp.error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{sp.error}</div>}
      {sp.success && <div className="card border-green-200 bg-green-50 p-4 text-sm text-green-800">{sp.success}</div>}

      <section className="flex flex-wrap gap-2">
        <Link href={`/seller/promotions/${kind}`} className={`rounded-full px-4 py-2 text-sm font-semibold ${statusFilter === 'ALL' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          All ({promotions.length})
        </Link>
        {validStatuses.map((status) => (
          <Link
            key={status}
            href={`/seller/promotions/${kind}?status=${status}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${statusFilter === status ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {formatSalesPromotionStatus(status as any)} ({counts[status] ?? 0})
          </Link>
        ))}
      </section>

      <section className="space-y-4">
        {filteredPromotions.length === 0 ? (
          <div className="card p-8 text-center text-sm text-slate-500">
            No {statusFilter === 'ALL' ? kind : `${formatSalesPromotionStatus(statusFilter as any).toLowerCase()} ${kind}`} yet.
          </div>
        ) : (
          filteredPromotions.map((promotion) => (
            <Link key={promotion.id} href={`/seller/promotions/${kind}/${promotion.id}`} className="card block p-6 transition-colors hover:bg-slate-50">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{promotion.name}</h2>
                    <span className={`badge ${salesPromotionStatusTone(promotion.status)}`}>{formatSalesPromotionStatus(promotion.status)}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">{summarizeSalesPromotion(promotion)}</p>
                </div>
                <span className="text-sm font-semibold text-slate-600">Open details →</span>
              </div>
              <div className="mt-4 grid gap-3 text-sm text-slate-500 md:grid-cols-3">
                <div>
                  <p className="font-semibold text-slate-700">Schedule</p>
                  <p>{formatSalesPromotionDate(promotion.startsAt)} → {formatSalesPromotionDate(promotion.endsAt)}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Usage</p>
                  <p>{promotion.usageCount} used{promotion.totalUsageLimit ? ` / ${promotion.totalUsageLimit}` : ''}</p>
                </div>
                <div>
                  <p className="font-semibold text-slate-700">Listings</p>
                  <p>{promotion.applicableProductIds.length === 0 ? 'All current listings' : `${promotion.applicableProductIds.length} selected`}</p>
                </div>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
