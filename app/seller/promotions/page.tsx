import Link from 'next/link';
import type { Metadata } from 'next';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';
import { requireSeller } from '@/lib/require-seller';
import {
  getPromotionRouteLabel,
  listSellerPromotions,
  summarizeSalesPromotion,
  syncSalesPromotionStatuses,
  type PromotionRouteKind,
} from '@/lib/seller-promotions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller Promotions' };

export default async function SellerPromotionsPage() {
  const { sellerId } = await requireSeller();
  await syncSalesPromotionStatuses(sellerId);

  const [discounts, offers] = await Promise.all([
    listSellerPromotions(sellerId, 'discounts'),
    listSellerPromotions(sellerId, 'offers'),
  ]);

  const sections = [
    { kind: 'discounts' as PromotionRouteKind, items: discounts, description: 'Percentage and fixed-amount campaigns for selected listings.' },
    { kind: 'offers' as PromotionRouteKind, items: offers, description: 'Free gift and buy-more rules with shopper-friendly trigger descriptions.' },
  ];

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div className="space-y-4">
        <Link href="/seller" className="text-sm text-slate-500 hover:underline">← Back to seller dashboard</Link>
        <SellerPromotionsNav active="overview" />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-slate-900">Promotions</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">
              Use focused tools for discounts, free gifts, and buy-more offers without mixing them into your sales analytics view.
            </p>
          </div>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div key={section.kind} className="card p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{getPromotionRouteLabel(section.kind)}</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{section.items.length}</h2>
                <p className="mt-2 text-sm text-slate-500">{section.description}</p>
              </div>
              <Link href={`/seller/promotions/${section.kind}/new`} className="btn-primary text-xs">
                New {getPromotionRouteLabel(section.kind).slice(0, -1)}
              </Link>
            </div>
            <div className="mt-5 space-y-3">
              {section.items.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No {section.kind} yet.
                </p>
              ) : (
                section.items.slice(0, 3).map((promotion) => (
                  <Link key={promotion.id} href={`/seller/promotions/${section.kind}/${promotion.id}`} className="block rounded-2xl border border-slate-200 px-4 py-4 transition-colors hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{promotion.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{summarizeSalesPromotion(promotion)}</p>
                      </div>
                      <span className="text-xs font-semibold text-slate-500">View</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
            <Link href={`/seller/promotions/${section.kind}`} className="mt-4 inline-flex text-sm font-semibold text-slate-700 hover:underline">
              Manage {section.kind} →
            </Link>
          </div>
        ))}
      </section>
    </main>
  );
}
