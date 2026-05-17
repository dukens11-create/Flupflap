import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SellerPromotionForm from '@/components/SellerPromotionForm';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import {
  getPromotionRouteLabel,
  getSellerPromotionProductOptions,
  isPromotionRouteKind,
  syncSalesPromotionStatuses,
  type PromotionRouteKind,
} from '@/lib/seller-promotions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ kind: string; id: string }> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) return { title: 'Edit Promotion' };
  return { title: `Edit ${getPromotionRouteLabel(kind).slice(0, -1)} | Seller Promotions` };
}

export default async function SellerPromotionEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string; id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { kind, id } = await params;
  if (!isPromotionRouteKind(kind)) notFound();

  const { sellerId } = await requireSeller();
  await syncSalesPromotionStatuses(sellerId);
  const [promotion, products, sp] = await Promise.all([
    prisma.salesPromotion.findFirst({
      where: {
        id,
        sellerId,
        kind: kind === 'discounts' ? 'DISCOUNT' : 'OFFER',
      },
    }),
    getSellerPromotionProductOptions(sellerId),
    searchParams,
  ]);

  if (!promotion) notFound();

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-4">
        <Link href={`/seller/promotions/${kind}/${id}`} className="text-sm text-slate-500 hover:underline">← Back to details</Link>
        <SellerPromotionsNav active={kind as PromotionRouteKind} />
        <div>
          <h1 className="text-3xl font-black text-slate-900">Edit {promotion.name}</h1>
          <p className="mt-2 text-sm text-slate-500">Update scheduling, lifecycle, scope, and detailed seller-facing rules.</p>
        </div>
      </div>

      {sp.error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{sp.error}</div>}

      <SellerPromotionForm
        kind={kind as PromotionRouteKind}
        action={`/api/seller/promotions/${kind}/${id}`}
        products={products}
        submitLabel={`Save ${getPromotionRouteLabel(kind).slice(0, -1)}`}
        cancelHref={`/seller/promotions/${kind}/${id}`}
        initialValues={promotion}
      />
    </main>
  );
}
