import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { MapPin, Calendar, Phone, Tag, Eye, Heart, ExternalLink } from 'lucide-react';
import { expireGarageSales } from '@/lib/garage-sales';
import {
  getGarageSaleLiveControlsBlockMessage,
  getGarageSaleOwnerHiddenStatusMessage,
  getGarageSaleVisibilityBlockReason,
  isGarageSalePubliclyVisible,
} from '@/lib/garage-sale-visibility';
import GarageSaleLivePanel from '@/components/GarageSaleLivePanel';
import GarageSaleBuyerLiveView from '@/components/GarageSaleBuyerLiveView';
import GarageSaleShareButton from '@/components/GarageSaleShareButton';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const sale = await prisma.garageSale.findUnique({ where: { id }, select: { title: true, city: true, state: true } });
  if (!sale) return { title: 'Garage Sale Not Found' };
  return { title: `${sale.title} – ${sale.city}, ${sale.state} | FlupFlap` };
}

const SALE_TYPE_LABELS: Record<string, string> = {
  GARAGE_SALE: 'Garage Sale',
  YARD_SALE: 'Yard Sale',
  ESTATE_SALE: 'Estate Sale',
  MOVING_SALE: 'Moving Sale',
};

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default async function GarageSaleDetailPage({ params }: Params) {
  const { id } = await params;
  await expireGarageSales();

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    include: {
      seller: {
        select: { id: true, name: true, shopName: true, profileImageUrl: true, phoneVerified: true, phone: true },
      },
      _count: { select: { favorites: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
    },
  });

  if (!sale) notFound();

  const session = await getServerSession(authOptions);
  const isOwner = session?.user?.id === sale.sellerId;
  const isAdmin = session?.user?.role === 'ADMIN';
  const lifecycle = deriveGarageSaleLifecycle(sale);

  if (!lifecycle.publiclyVisible && !isOwner && !isAdmin) notFound();

  const listingIsPubliclyVisible = lifecycle.publiclyVisible;
  const openNow = lifecycle.openNow;
  const visibilityBlockReason = getGarageSaleVisibilityBlockReason(sale);
  const blockedLiveControlsMessage = getGarageSaleLiveControlsBlockMessage(sale);
  const ownerHiddenStatusMessage = getGarageSaleOwnerHiddenStatusMessage(sale);
  const hiddenStatusLabel = (() => {
    if (lifecycle.state === 'PAYMENT_PENDING') return 'PAYMENT PENDING';
    if (lifecycle.state === 'PENDING_REVIEW') return 'PENDING REVIEW';
    if (lifecycle.state === 'PAYMENT_FAILED') return 'PAYMENT FAILED';
    if (lifecycle.state === 'PAYMENT_REFUNDED') return 'REFUNDED';
    if (lifecycle.state === 'REJECTED') return 'REJECTED';
    if (lifecycle.state === 'EXPIRED') return 'EXPIRED';
    if (visibilityBlockReason === 'SPAM') return 'UNDER REVIEW';
    if (visibilityBlockReason === 'UNKNOWN_STATUS') return 'NOT VISIBLE';
    return lifecycle.state;
  })();
  const hiddenStatusBadgeClass = lifecycle.state === 'PAYMENT_PENDING' || lifecycle.state === 'PENDING_REVIEW'
    ? 'bg-yellow-100 text-yellow-700'
    : lifecycle.state === 'PAYMENT_FAILED' || lifecycle.state === 'PAYMENT_REFUNDED' || lifecycle.state === 'REJECTED'
      ? 'bg-red-100 text-red-700'
      : 'bg-slate-200 text-slate-700';
  const saleTypeLabel = SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType;
  const priceRange = sale.priceRangeMin != null && sale.priceRangeMax != null
    ? `$${sale.priceRangeMin}–$${sale.priceRangeMax}`
    : sale.priceRangeMin != null
      ? `From $${sale.priceRangeMin}`
      : null;

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${sale.address}, ${sale.city}, ${sale.state} ${sale.zipCode}`)}`;

  // Increment view count (fire-and-forget, log errors)
  if (listingIsPubliclyVisible && !isOwner) {
    prisma.garageSale.update({ where: { id }, data: { viewCount: { increment: 1 } } }).catch((err) => {
      console.error('[garage-sales] view count increment failed', err);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back link */}
      <Link href="/garage-sales" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        ← Back to Garage Sales
      </Link>

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        {sale.isFeatured && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            ⭐ Featured Sale
          </span>
        )}
        {sale.isLive && (
          <span className="inline-flex items-center rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
            🔴 LIVE NOW
          </span>
        )}
        {openNow ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            🟢 Open Now
          </span>
        ) : listingIsPubliclyVisible && sale.endDate < new Date() ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            Sale Ended
          </span>
        ) : listingIsPubliclyVisible ? (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Upcoming
          </span>
        ) : (isOwner || isAdmin) ? (
          <span
            aria-label="Listing is hidden from public view"
            className="inline-flex items-center rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700"
          >
            Hidden
          </span>
        ) : null}
        {(isOwner || isAdmin) && !listingIsPubliclyVisible && (
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${hiddenStatusBadgeClass}`}>
            {hiddenStatusLabel}
          </span>
        )}
        <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
          {saleTypeLabel}
        </span>
      </div>
      {isOwner && !listingIsPubliclyVisible && (
        <div className="card border-yellow-300 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-semibold">{ownerHiddenStatusMessage}</p>
          <Link href="/seller/garage-sales" className="mt-2 inline-block font-semibold underline">
            Open My Garage Sales
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main content */}
        <div className="space-y-6 lg:col-span-2">
          {/* Photo gallery */}
          {sale.photos.length > 0 ? (
            <div className="space-y-2">
              <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
                <Image
                  src={sale.photos[0]}
                  alt={sale.title}
                  fill
                  priority
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 66vw"
                />
              </div>
              {sale.photos.length > 1 && (
                <div className="grid grid-cols-4 gap-2">
                  {sale.photos.slice(1, 5).map((photo, i) => (
                    <div key={i} className="relative aspect-square overflow-hidden rounded-xl bg-slate-100">
                      <Image src={photo} alt={`Photo ${i + 2}`} fill className="object-cover" sizes="25vw" />
                      {i === 3 && sale.photos.length > 5 && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white font-bold text-lg">
                          +{sale.photos.length - 5}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-7xl">
              🏠
            </div>
          )}

          {/* Video */}
          {sale.videoUrl && (
            <div>
              <a href={sale.videoUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-semibold text-[var(--ff-primary-navy)] hover:underline">
                <ExternalLink size={14} /> Watch Sale Video
              </a>
            </div>
          )}

          {/* Title & Description */}
          <div className="card p-5 space-y-3">
            <h1 className="text-2xl font-black text-slate-900">{sale.title}</h1>
            {priceRange && (
              <p className="text-2xl font-black text-amber-600">{priceRange}</p>
            )}
            <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">{sale.description}</p>
          </div>

          {/* Categories */}
          {sale.categories.length > 0 && (
            <div className="card p-4 space-y-2">
              <h2 className="font-bold text-slate-900">Items Available</h2>
              <div className="flex flex-wrap gap-2">
                {sale.categories.map((cat) => (
                  <span key={cat} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 capitalize">
                    <Tag size={10} />
                    {cat.replace('_', ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Date & Location card */}
          <div className="card p-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <Calendar size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">When</p>
                  <p className="text-sm font-semibold text-slate-900">{formatDate(sale.startDate)}</p>
                  <p className="text-sm text-slate-600">{formatTime(sale.startDate)} – {formatTime(sale.endDate)}</p>
                  {sale.startDate.toDateString() !== sale.endDate.toDateString() && (
                    <p className="text-sm text-slate-600">to {formatDate(sale.endDate)}</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0 text-slate-400" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Where</p>
                  <p className="text-sm font-semibold text-slate-900">{sale.address}</p>
                  <p className="text-sm text-slate-600">{sale.city}, {sale.state} {sale.zipCode}</p>
                </div>
              </div>
            </div>

            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-brand w-full flex items-center justify-center gap-2"
            >
              <MapPin size={14} /> Get Directions
            </a>
          </div>

          {/* Seller card */}
          <div className="card p-4 space-y-3">
            <h2 className="font-bold text-slate-900">Seller</h2>
            <div className="flex items-center gap-3">
              {sale.seller.profileImageUrl ? (
                <Image src={sale.seller.profileImageUrl} alt={sale.seller.name} width={40} height={40} className="h-10 w-10 rounded-full object-cover" />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-lg font-bold text-slate-600">
                  {(sale.seller.shopName ?? sale.seller.name).charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold text-slate-900">{sale.seller.shopName?.trim() || sale.seller.name}</p>
                {sale.seller.phoneVerified && (
                  <span className="text-xs text-emerald-600 font-medium">✓ Phone Verified</span>
                )}
              </div>
            </div>

            {sale.sellerPhone && (
              <a
                href={`tel:${sale.sellerPhone}`}
                className="flex items-center gap-2 text-sm font-semibold text-[var(--ff-primary-navy)] hover:underline"
              >
                <Phone size={14} /> {sale.sellerPhone}
              </a>
            )}

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Eye size={13} /> {sale.viewCount} views
              <span>·</span>
              <Heart size={13} /> {sale._count.favorites} saved
            </div>
          </div>

          {/* Stats / share */}
          <div className="card p-4 space-y-2">
            <GarageSaleShareButton title={sale.title} />
          </div>

          {/* Live Preview — seller controls */}
          {isOwner && lifecycle.sellerCanGoLive && (
            <GarageSaleLivePanel saleId={sale.id} initialIsLive={sale.isLive} />
          )}
          {isOwner && !lifecycle.sellerCanGoLive && (
            <div className="card p-4 text-sm text-slate-600">
              {blockedLiveControlsMessage}
            </div>
          )}

          {/* Live Preview — buyer view */}
          {!isOwner && listingIsPubliclyVisible && (
            <GarageSaleBuyerLiveView
              saleId={sale.id}
              initialIsLive={sale.isLive}
              buyerName={session?.user?.name ?? null}
            />
          )}

          {/* Owner/admin actions */}
          {(isOwner || isAdmin) && (
            <div className="card p-4 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Actions</h2>
              <Link href={`/garage-sales/${sale.id}/edit`} className="btn-outline w-full text-center block">
                Edit Listing
              </Link>
              {isAdmin && (
                <Link href={`/admin/garage-sales`} className="btn-outline w-full text-center block text-xs">
                  Admin Panel
                </Link>
              )}
              {(sale.status === 'EXPIRED' || sale.endDate < new Date()) && (
                <form action={`/api/garage-sales/${sale.id}/repost`} method="POST">
                  <button type="submit" className="btn-brand w-full text-xs">
                    Repost &amp; Pay Again
                  </button>
                </form>
              )}
            </div>
          )}

          {(isOwner || isAdmin) && (
            <div className="card p-4 space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment history</h2>
              {sale.payments.length === 0 ? (
                <p className="text-xs text-slate-500">No payments yet.</p>
              ) : (
                <ul className="space-y-2 text-xs">
                  {sale.payments.map((payment) => (
                    <li key={payment.id} className="rounded-lg border border-slate-200 p-2">
                      <p className="font-semibold text-slate-800">{payment.status} · ${(payment.amountCents / 100).toFixed(2)}</p>
                      <p className="text-slate-500">{new Date(payment.createdAt).toLocaleString()}</p>
                      {payment.stripeReceiptUrl && (
                        <a href={payment.stripeReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--ff-primary-navy)] hover:underline">
                          View receipt
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
