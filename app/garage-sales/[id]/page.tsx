import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { MapPin, Calendar, Phone, Tag, Eye, Heart, ExternalLink } from 'lucide-react';
import { expireGarageSales, resolveGarageSaleByRouteParam } from '@/lib/garage-sales';
import {
  getGarageSaleLiveControlsBlockMessage,
  getGarageSaleOwnerHiddenStatusMessage,
  getGarageSaleVisibilityBlockReason,
  getGarageSaleVisibilityTone,
  isGarageSalePubliclyVisible,
  isGarageSalePubliclyOpenNow,
} from '@/lib/garage-sale-visibility';
import GarageSaleLivePanel from '@/components/GarageSaleLivePanel';
import GarageSaleBuyerLiveView from '@/components/GarageSaleBuyerLiveView';
import GarageSaleShareButton from '@/components/GarageSaleShareButton';
import GarageSalePaymentStatusBanner from '@/components/GarageSalePaymentStatusBanner';
import GarageSalePaymentSyncButton from '@/components/GarageSalePaymentSyncButton';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import { createPageMetadata } from '@/lib/seo';
import { syncGarageSaleCheckoutSessionForSeller } from '@/lib/garage-sale-payment-sync';
import { logInfo, logWarn } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string; session_id?: string; reposted?: string }>;
};
const META_DESCRIPTION_MAX_LENGTH = 160;

function truncateMetaDescription(input: string): string {
  const trimmed = input.trim();
  if (trimmed.length <= META_DESCRIPTION_MAX_LENGTH) return trimmed;

  const truncated = trimmed.slice(0, META_DESCRIPTION_MAX_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');
  const safeCutoff = lastSpace > 80 ? lastSpace : META_DESCRIPTION_MAX_LENGTH;
  return `${truncated.slice(0, safeCutoff).trimEnd()}…`;
}

export async function generateMetadata({ params }: Pick<Params, 'params'>): Promise<Metadata> {
  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'garage-sales/[id]/metadata');
  const sale = resolvedSale
    ? await prisma.garageSale.findUnique({
      where: { id: resolvedSale.id },
      select: {
        id: true,
        title: true,
        city: true,
        state: true,
        description: true,
        status: true,
        paymentStatus: true,
        isArchived: true,
        startDate: true,
        endDate: true,
        isLive: true,
        isSpam: true,
      },
    })
    : null;
  if (!sale) {
    return createPageMetadata({
      title: 'Garage Sale Not Found',
      description: 'The requested garage sale could not be found.',
      noIndex: true,
    });
  }

  const lifecycle = deriveGarageSaleLifecycle(sale);
  const isPubliclyIndexable = lifecycle.publiclyVisible && !sale.isSpam;
  const trimmedDescription = sale.description?.trim();
  const description = trimmedDescription
    ? truncateMetaDescription(trimmedDescription)
    : `View sale details for ${sale.title} in ${sale.city}, ${sale.state}.`;

  return createPageMetadata({
    title: `${sale.title} – ${sale.city}, ${sale.state} | FlupFlap`,
    description,
    path: `/garage-sales/${sale.id}`,
    noIndex: !isPubliclyIndexable,
  });
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

function formatPaymentAmount(amountCents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amountCents / 100);
}

function buildPaymentCallbackUrl(
  saleId: string,
  searchParams: { payment?: string; session_id?: string; reposted?: string },
) {
  const query = new URLSearchParams();
  if (searchParams.payment) query.set('payment', searchParams.payment);
  if (searchParams.session_id) query.set('session_id', searchParams.session_id);
  if (searchParams.reposted) query.set('reposted', searchParams.reposted);
  return `/garage-sales/${saleId}${query.size ? `?${query.toString()}` : ''}`;
}

export default async function GarageSaleDetailPage({ params, searchParams }: Params) {
  const { id } = await params;
  const sp = await searchParams;
  await expireGarageSales();
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'garage-sales/[id]/page');
  if (!resolvedSale) notFound();
  if (id !== resolvedSale.id) {
    redirect(buildPaymentCallbackUrl(resolvedSale.id, sp));
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: resolvedSale.id },
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

  if (sp.payment === 'success' && sp.session_id && isOwner) {
    const syncResult = await syncGarageSaleCheckoutSessionForSeller({
      checkoutSessionId: sp.session_id,
      saleId: sale.id,
      sellerId: sale.sellerId,
    });
    if (!syncResult.synced && syncResult.reason !== 'already_paid' && syncResult.reason !== 'payment_not_paid') {
      logWarn('Garage sale payment confirmation still pending on return route', {
        tag: 'garage-sales/[id]/page',
        saleId: sale.id,
        reason: syncResult.reason ?? 'unknown',
      });
    }
    if (syncResult.synced || syncResult.reason === 'already_paid') {
      const query = new URLSearchParams();
      query.set('payment', 'success');
      if (sp.reposted) query.set('reposted', sp.reposted);
      redirect(`/garage-sales/${sale.id}?${query.toString()}`);
    }
  }

  const lifecycle = deriveGarageSaleLifecycle(sale);
  const listingIsPubliclyVisible = isGarageSalePubliclyVisible(sale);
  const openNow = isGarageSalePubliclyOpenNow(sale);
  const visibilityBlockReason = getGarageSaleVisibilityBlockReason(sale);
  const blockedLiveControlsMessage = getGarageSaleLiveControlsBlockMessage(sale, visibilityBlockReason);
  const ownerHiddenStatusMessage = getGarageSaleOwnerHiddenStatusMessage(sale, visibilityBlockReason);
  const canShowLiveControls = isOwner && lifecycle.sellerCanGoLive && visibilityBlockReason === null;
  const hiddenStatusLabel = (() => {
    if (visibilityBlockReason === 'ARCHIVED') return 'ARCHIVED';
    if (visibilityBlockReason === 'SPAM') return 'UNDER REVIEW';
    if (visibilityBlockReason === 'PAYMENT_PENDING') return 'PAYMENT PENDING';
    if (visibilityBlockReason === 'PAYMENT_FAILED') return 'PAYMENT FAILED';
    if (visibilityBlockReason === 'PAYMENT_REFUNDED') return 'REFUNDED';
    if (visibilityBlockReason === 'PENDING_REVIEW') return 'UNDER REVIEW';
    if (visibilityBlockReason === 'REJECTED') return 'REJECTED';
    if (visibilityBlockReason === 'UPCOMING') return 'UPCOMING';
    if (visibilityBlockReason === 'EXPIRED') return 'EXPIRED';
    if (visibilityBlockReason === 'UNKNOWN_STATUS') return 'NOT VISIBLE';
    return 'HIDDEN';
  })();
  const hiddenStatusTone = getGarageSaleVisibilityTone(visibilityBlockReason);
  const hiddenStatusBadgeClass = hiddenStatusTone === 'warning'
    ? 'bg-yellow-100 text-yellow-700'
    : hiddenStatusTone === 'danger'
      ? 'bg-red-100 text-red-700'
      : 'bg-slate-200 text-slate-700';

  if (!listingIsPubliclyVisible && !isOwner && !isAdmin) {
    if (sp.payment === 'success') {
      const callbackUrl = encodeURIComponent(buildPaymentCallbackUrl(sale.id, sp));
      redirect(`/login?callbackUrl=${callbackUrl}`);
    }
    logWarn('Garage sale public route returned not found for non-visible listing', {
      tag: 'garage-sales/[id]/page',
      saleId: sale.id,
      routeParam: id,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
    });
    notFound();
  }
  logInfo('Garage sale public page fetched', {
    tag: 'garage-sales/[id]/page',
    saleId: sale.id,
    routeParam: id,
    isOwner,
    listingIsPubliclyVisible,
  });
  const saleTypeLabel = SALE_TYPE_LABELS[sale.saleType] ?? sale.saleType;
  const priceRange = sale.priceRangeMin != null && sale.priceRangeMax != null
    ? `$${sale.priceRangeMin}–$${sale.priceRangeMax}`
    : sale.priceRangeMin != null
      ? `From $${sale.priceRangeMin}`
      : null;

  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${sale.address}, ${sale.city}, ${sale.state} ${sale.zipCode}`)}`;

  // Increment view count (fire-and-forget, log errors)
  if (listingIsPubliclyVisible && !isOwner) {
    prisma.garageSale.update({ where: { id: sale.id }, data: { viewCount: { increment: 1 } } }).catch((err) => {
      console.error('[garage-sales] view count increment failed', err);
    });
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Back link */}
      <Link href="/garage-sales" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900">
        ← Back to Garage Sales
      </Link>

      {isOwner && sp.payment === 'success' && (
        <GarageSalePaymentStatusBanner
          saleId={sale.id}
          initialPaymentStatus={sale.paymentStatus}
          initialListingStatus={sale.status}
          isPubliclyVisible={listingIsPubliclyVisible}
          isReposted={sp.reposted === '1'}
          hasSessionId={Boolean(sp.session_id)}
        />
      )}

      {/* Status badges */}
      <div className="flex flex-wrap items-center gap-2">
        {sale.isFeatured && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
            ⭐ Featured Sale
          </span>
        )}
        {sale.isLive && (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            LIVE
          </span>
        )}
        {openNow ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-700">
            ACTIVE
          </span>
        ) : listingIsPubliclyVisible && sale.endDate < new Date() ? (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">
            Sale Ended
          </span>
        ) : listingIsPubliclyVisible ? (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Garage Sale
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
        <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
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
          {canShowLiveControls && (
            <GarageSaleLivePanel saleId={sale.id} initialIsLive={sale.isLive} />
          )}
          {isOwner && !canShowLiveControls && (
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
              <Link href={`/garage-sales/manage/${sale.id}`} className="btn-outline w-full text-center block">
                Manage Listing
              </Link>
              <GarageSalePaymentSyncButton saleId={sale.id} />
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
                      <p className="font-semibold text-slate-800">{payment.status} · {formatPaymentAmount(payment.amountCents)}</p>
                      <p className="text-slate-500">
                        Last updated: {new Date(payment.updatedAt).toLocaleString()}
                      </p>
                      {payment.stripeCheckoutId && (
                        <p className="break-all text-slate-500">Session: {payment.stripeCheckoutId}</p>
                      )}
                      {payment.stripePaymentId && (
                        <p className="break-all text-slate-500">Transaction: {payment.stripePaymentId}</p>
                      )}
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
