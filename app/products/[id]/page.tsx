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
import ReportItemButton from '@/components/ReportItemButton';
import RatingStars from '@/components/RatingStars';
import type { Metadata } from 'next';
import { expirePromotions } from '@/lib/promotions';
import { formatAverageRating, isReviewEligibleStatus } from '@/lib/reviews';

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

  const [reviewSummary, hiddenReviewCount, sellerReviewSummary, visibleReviews] = await Promise.all([
    prisma.orderItem.aggregate({
      where: {
        productId: id,
        reviewRating: { not: null },
        reviewBlockedByDispute: false,
      },
      _avg: { reviewRating: true },
      _count: { reviewRating: true },
    }),
    prisma.orderItem.count({
      where: {
        productId: id,
        reviewRating: { not: null },
        reviewBlockedByDispute: true,
      },
    }),
    prisma.orderItem.aggregate({
      where: {
        product: { sellerId: product.sellerId },
        reviewRating: { not: null },
        reviewBlockedByDispute: false,
      },
      _avg: { reviewRating: true },
      _count: { reviewRating: true },
    }),
    prisma.orderItem.findMany({
      where: {
        productId: id,
        reviewRating: { not: null },
        reviewBlockedByDispute: false,
      },
      orderBy: [
        { reviewUpdatedAt: 'desc' },
        { reviewCreatedAt: 'desc' },
      ],
      take: 10,
      include: {
        order: {
          select: {
            createdAt: true,
            status: true,
            buyer: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  // Hide the message button if the viewer is the seller of this product
  const isOwnListing = session?.user?.id === product.seller.id;
  const activePromotion = product.promotions[0] ?? null;
  if (activePromotion && !isOwnListing) {
    await prisma.promotion.update({
      where: { id: activePromotion.id },
      data: { clickCount: { increment: 1 } },
    });
  }

  const reviewCount = reviewSummary._count.reviewRating;
  const reviewAverage = reviewSummary._avg.reviewRating ?? null;
  const sellerReviewCount = sellerReviewSummary._count.reviewRating;
  const sellerReviewAverage = sellerReviewSummary._avg.reviewRating ?? null;

  return (
    <main className="max-w-4xl mx-auto">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Back to browse</Link>
      <div className="card overflow-hidden flex flex-col md:flex-row gap-0">
        <div className="relative w-full md:w-96 h-72 md:h-auto flex-shrink-0 bg-slate-100">
          <Image src={product.imageUrl} alt={product.title} fill className="object-cover" />
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
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Sold by {product.seller.name}</span>
              {sellerReviewCount > 0 && sellerReviewAverage !== null && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1">
                    <RatingStars rating={sellerReviewAverage} />
                    <span className="font-semibold text-slate-700">
                      {formatAverageRating(sellerReviewAverage)}
                    </span>
                    <span>seller rating ({sellerReviewCount})</span>
                  </span>
                </>
              )}
            </div>
            {reviewCount > 0 && reviewAverage !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <RatingStars rating={reviewAverage} className="text-base" />
                <span className="font-semibold text-slate-900">{formatAverageRating(reviewAverage)}</span>
                <span>
                  {reviewCount} review{reviewCount === 1 ? '' : 's'}
                </span>
              </div>
            )}
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
            <ContactSellerButton productId={product.id} />
          )}
          {/* Report item — hidden for the seller's own listing */}
          {!isOwnListing && (
            <div className="pt-1">
              <ReportItemButton productId={product.id} />
            </div>
          )}
        </div>
      </div>

      <section className="mt-6 grid gap-6 md:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
        <div className="card p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">Product reviews</h2>
              <p className="text-sm text-slate-500">
                Reviews from completed marketplace purchases only.
              </p>
            </div>
            {reviewCount > 0 && reviewAverage !== null && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                <p className="text-2xl font-black text-slate-900">{formatAverageRating(reviewAverage)}</p>
                <div className="mt-1 flex items-center justify-end gap-2 text-sm text-slate-500">
                  <RatingStars rating={reviewAverage} />
                  <span>{reviewCount} total</span>
                </div>
              </div>
            )}
          </div>

          {hiddenReviewCount > 0 && (
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {hiddenReviewCount} review{hiddenReviewCount === 1 ? '' : 's'} temporarily hidden while a dispute is being reviewed.
            </p>
          )}

          {visibleReviews.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              No reviews yet for this item.
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {visibleReviews.map((review) => {
                if (review.reviewRating === null) return null;

                return (
                  <article key={review.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-900">{review.order.buyer.name}</p>
                          {isReviewEligibleStatus(review.order.status) && (
                            <span className="badge badge-green">Verified purchase</span>
                          )}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                          <RatingStars rating={review.reviewRating} />
                          <span>{review.reviewRating}/5</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">
                        {new Date(review.reviewUpdatedAt ?? review.reviewCreatedAt ?? review.order.createdAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-700">
                      {review.reviewComment?.trim() || 'Buyer left a star rating without additional comments.'}
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="card p-6">
          <h2 className="text-lg font-bold">Seller rating</h2>
          {sellerReviewCount > 0 && sellerReviewAverage !== null ? (
            <>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-3xl font-black text-slate-900">{formatAverageRating(sellerReviewAverage)}</p>
                <div>
                  <RatingStars rating={sellerReviewAverage} className="text-base" />
                  <p className="text-sm text-slate-500">
                    {sellerReviewCount} verified purchase rating{sellerReviewCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Based on buyer feedback across this seller&apos;s completed orders.
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              This seller does not have any public ratings yet.
            </p>
          )}
        </aside>
      </section>
    </main>
  );
}
