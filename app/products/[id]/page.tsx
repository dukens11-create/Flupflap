import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import AddToCartButton from '@/components/AddToCartButton';
import BuyNowButton from '@/components/BuyNowButton';
import PickupDistance from '@/components/PickupDistance';
import ContactSellerButton from '@/components/ContactSellerButton';
import MakeOfferButton from '@/components/MakeOfferButton';
import ReportItemButton from '@/components/ReportItemButton';
import ReportSellerButton from '@/components/ReportSellerButton';
import ProductGallery from '@/components/ProductGallery';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { getSellerResponseStats, SELLER_RESPONSE_WINDOW_HOURS } from '@/lib/messages';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await prisma.product.findUnique({ where: { id } });
  return { title: p?.title ?? 'Product not found' };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await expirePromotions();
  const [product, session] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: {
        seller: { select: { id: true, name: true } },
        promotions: {
          where: { status: 'ACTIVE', expiresAt: { gt: new Date() } },
          orderBy: { expiresAt: 'desc' },
          take: 1,
        },
      },
    }),
    getServerSession(authOptions),
  ]);

  if (!product || product.status !== 'APPROVED') notFound();

  // Hide the message button if the viewer is the seller of this product
  const isOwnListing = session?.user?.id === product.seller.id;
  const activePromotion = product.promotions[0] ?? null;
  if (activePromotion && !isOwnListing) {
    await prisma.promotion.update({
      where: { id: activePromotion.id },
      data: { clickCount: { increment: 1 } },
    });
  }
  const sellerResponseStats = await getSellerResponseStats(product.seller.id);

  return (
    <main className="max-w-4xl mx-auto">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Back to browse</Link>
      <div className="card overflow-hidden flex flex-col md:flex-row gap-0">
        <div className="w-full md:w-96 flex-shrink-0 bg-slate-100 p-0">
          {product.images?.length ? (
            <ProductGallery
              images={product.images}
              title={product.title}
              videoUrl={product.videoUrl}
            />
          ) : (
            <div className="relative w-full h-72 md:h-full">
              <Image src={product.imageUrl} alt={product.title} fill className="object-cover" />
            </div>
          )}
        </div>
        <div className="p-6 flex flex-col gap-4 flex-1">
          <div>
            <p className="text-xs uppercase text-slate-500 font-medium">
              {product.condition} · {product.category}
            </p>
            {activePromotion && (
              <span className="badge bg-yellow-400 text-yellow-900 text-xs font-bold mt-2 inline-flex">Boosted</span>
            )}
            <h1 className="text-2xl font-black mt-1">{product.title}</h1>
            <p className="text-3xl font-black text-blue-700 mt-2">{dollars(product.priceCents)}</p>
            {product.pickupAvailable ? (
              <p className="text-sm text-slate-500">+ {dollars(product.shippingCents)} shipping <span className="text-green-700 font-medium">or free local pickup</span></p>
            ) : (
              <p className="text-sm text-slate-500">+ {dollars(product.shippingCents)} shipping</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <p>Sold by {product.seller.name}</p>
              {sellerResponseStats.responseRate !== null ? (
                <span className="badge badge-green">
                  {sellerResponseStats.responseRate}% response rate
                </span>
              ) : (
                <span className="badge badge-slate">Not enough data</span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Based on buyer messages from the last 90 days and replies sent within {SELLER_RESPONSE_WINDOW_HOURS} hours.
            </p>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">{product.description}</p>

          {/* Pickup distance widget */}
          {product.pickupAvailable && product.pickupCity && product.pickupState && product.pickupPostalCode && (
            <PickupDistance
              pickupCity={product.pickupCity}
              pickupState={product.pickupState}
              pickupPostalCode={product.pickupPostalCode}
            />
          )}
          {product.pickupAvailable && product.pickupCity && product.pickupState && !product.pickupPostalCode && (
            <div className="mt-1 p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
              <div className="flex items-center gap-2 font-semibold text-green-800">
                <span>🏠</span>
                <span>Local pickup available</span>
              </div>
              <p className="text-green-700 mt-0.5">
                Located in <span className="font-medium">{product.pickupCity}, {product.pickupState}</span>
              </p>
            </div>
          )}

          {product.inventory <= 0 ? (
            <p className="text-red-600 font-semibold">Out of stock</p>
          ) : (
            <div className="flex flex-col gap-2">
              <AddToCartButton item={{
                id: product.id,
                title: product.title,
                priceCents: product.priceCents,
                imageUrl: product.imageUrl,
                shippingCents: product.shippingCents,
                pickupAvailable: product.pickupAvailable,
                pickupCity: product.pickupCity ?? undefined,
                pickupState: product.pickupState ?? undefined,
              }} />
              <BuyNowButton productId={product.id} />
              {product.pickupAvailable && (
                <BuyNowButton productId={product.id} isPickup />
              )}
            </div>
          )}
          {product.inventory > 0 && product.inventory <= 3 && (
            <p className="text-orange-600 text-sm font-medium">Only {product.inventory} left!</p>
          )}
          {/* Contact seller — hidden for the seller's own listing */}
          {!isOwnListing && (
            <div className="space-y-2">
              <MakeOfferButton productId={product.id} priceCents={product.priceCents} />
              <ContactSellerButton productId={product.id} />
            </div>
          )}
          {/* Report item — hidden for the seller's own listing */}
          {!isOwnListing && (
            <div className="pt-1">
              <ReportSellerButton sellerId={product.seller.id} sellerName={product.seller.name} />
            </div>
          )}
          {!isOwnListing && (
            <div className="pt-1">
              <ReportItemButton productId={product.id} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
