'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Star, Store } from 'lucide-react';
import { dollars } from '@/lib/money';
import { useI18n } from '@/components/I18nProvider';

function isApprovedSeller(verification?: {
  status?: string | null;
  eligibleToListAt?: string | Date | null;
  adminFallbackStatus?: string | null;
} | null) {
  if (!verification || verification.status !== 'APPROVED') return false;
  if (verification.adminFallbackStatus === 'APPROVED') return true;
  return Boolean(verification.eligibleToListAt);
}

function percentageToStarCount(rate: number) {
  return Math.round(rate / 20);
}

export default function ProductCard({ p: product }:{p:any}){
  const { t } = useI18n();
  const isFeatured = !!product.activePromotion;
  const isTrending = (product.cartInterest?.totalAdds ?? 0) >= 5;
  const pickupLocation = `${product.pickupCity}${product.pickupState ? `, ${product.pickupState}` : ''}`;
  const sellerVerified = isApprovedSeller(product.seller?.verificationSubmission);
  const phoneVerified = !!product.seller?.phoneVerified;
  const sellerBadge = sellerVerified
    ? t('product.verifiedSeller')
    : phoneVerified
      ? t('product.phoneVerified')
      : t('product.newSeller');
  const responseRate = typeof product.sellerResponseRate === 'number' ? product.sellerResponseRate : null;
  const filledStars = responseRate === null ? 0 : percentageToStarCount(responseRate);
  const cardClasses = `group flex h-full flex-col overflow-hidden rounded-[28px] border bg-white shadow-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-xl ${isFeatured ? 'border-amber-200 ring-2 ring-amber-300' : 'border-slate-200'}`;

  return (
    <div className={cardClasses}>
      <div className="relative aspect-[4/3] bg-slate-100">
        <Image src={product.imageUrl} alt={product.title} fill className="object-cover transition-transform duration-300 group-hover:scale-105"/>
        {isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm">{t('product.sponsored')}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <span>{product.condition}</span>
            <span className="h-1 w-1 rounded-full bg-slate-300" />
            <span>{product.category}</span>
          </div>
          <h3 className="line-clamp-2 text-sm font-bold text-slate-900 sm:text-base">{product.title}</h3>
          <p className="text-lg font-black text-amber-600 sm:text-xl">{dollars(product.priceCents)}</p>
        </div>
        <p className="text-xs text-slate-500">{t('product.shipping', { amount: dollars(product.shippingCents || 0) })}</p>
        {product.pickupAvailable&&product.pickupCity&&<p className="text-xs font-medium text-emerald-700">{t('product.pickupIn', { location: pickupLocation })}</p>}

        <div className="mt-auto space-y-3 border-t border-slate-100 pt-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }, (_, index) => (
              <Star
                key={`star-${index}`}
                size={14}
                className={index < filledStars ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}
              />
            ))}
            <span className="ml-1 text-xs font-medium text-slate-500">
              {responseRate === null ? t('product.newSeller') : t('product.responseRate', { value: responseRate })}
            </span>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-700">
              <Store size={14} className="text-slate-400" />
              <span className="truncate font-semibold">{product.seller?.name ?? t('product.sellerFallback')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sellerVerified ? 'bg-emerald-100 text-emerald-700' : phoneVerified ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                <ShieldCheck size={12} />
                {sellerBadge}
              </span>
              {!sellerVerified && !phoneVerified && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {t('product.newSellerBadge')}
                </span>
              )}
              {isTrending && (
                <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                  {t('product.trending')}
                </span>
              )}
            </div>
          </div>

          <Link className="btn-brand w-full" href={`/products/${product.id}`}>{t('product.viewItem')}</Link>
        </div>
      </div>
    </div>
  );
}
