import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import SellerPromotionForm from '@/components/SellerPromotionForm';
import SellerPromotionsNav from '@/components/SellerPromotionsNav';
import { requireSeller } from '@/lib/require-seller';
import {
  getPromotionRouteLabel,
  getSellerPromotionProductOptions,
  isPromotionRouteKind,
  type PromotionRouteKind,
} from '@/lib/seller-promotions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) return { title: 'New Promotion' };
  return { title: `New ${getPromotionRouteLabel(kind).slice(0, -1)} | Seller Promotions` };
}

export default async function SellerPromotionNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { kind } = await params;
  if (!isPromotionRouteKind(kind)) notFound();

  const { sellerId } = await requireSeller();
  const products = await getSellerPromotionProductOptions(sellerId);
  const sp = await searchParams;

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-4">
        <Link href={`/seller/promotions/${kind}`} className="text-sm text-slate-500 hover:underline">← Back to {getPromotionRouteLabel(kind).toLowerCase()}</Link>
        <SellerPromotionsNav active={kind as PromotionRouteKind} />
        <div>
          <h1 className="text-3xl font-black text-slate-900">New {getPromotionRouteLabel(kind).slice(0, -1)}</h1>
          <p className="mt-2 text-sm text-slate-500">Create a focused seller-facing {kind === 'discounts' ? 'discount' : 'offer'} with scheduling, clear details, and lifecycle visibility.</p>
        </div>
      </div>

      {sp.error && <div className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{sp.error}</div>}

      <SellerPromotionForm
        kind={kind as PromotionRouteKind}
        action={`/api/seller/promotions/${kind}`}
        products={products}
        submitLabel={`Create ${getPromotionRouteLabel(kind).slice(0, -1)}`}
        cancelHref={`/seller/promotions/${kind}`}
      />
    </main>
  );
}
