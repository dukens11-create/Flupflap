'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ShieldCheck, Star } from 'lucide-react';
import { dollars } from '@/lib/money';
import { useI18n } from '@/components/I18nProvider';
import { conditionBadgeClass } from '@/lib/condition-badge';
import UserAvatar from '@/components/UserAvatar';

const TRENDING_THRESHOLD = 5;

function resolveShippingKey(
  shippingMode: string | null | undefined,
  shippingCents: number,
): 'product.freeShipping' | 'product.shippingCalculated' | 'product.shipping' {
  if (shippingMode === 'FREE') return 'product.freeShipping';
  if (shippingMode === 'CALCULATED') return 'product.shippingCalculated';
  if (shippingCents > 0) return 'product.shipping';
  // Legacy: $0.00 without an explicit mode → calculated at checkout
  return 'product.shippingCalculated';
}

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
  const isTrending = (product.cartInterest?.totalAdds ?? 0) >= TRENDING_THRESHOLD;
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

  const shippingText = (() => {
    const key = resolveShippingKey(product.shippingMode, product.shippingCents);
    return key === 'product.shipping'
      ? t('product.shipping', { amount: dollars(product.shippingCents) })
      : t(key);
  })();

  return (
    <div className={cardClasses}>
      <div className="relative flex h-44 items-center justify-center bg-slate-50 sm:h-48">
        <Image
          src={product.imageUrl}
          alt={product.title}
          fill
          sizes="(max-width: 768px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-contain p-2 transition-transform duration-300 group-hover:scale-[1.02]"
        />
        {isFeatured && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-400 px-2.5 py-1 text-[11px] font-bold text-amber-950 shadow-sm">{t('product.sponsored')}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${conditionBadgeClass(product.condition)}`}>
              {product.condition}
            </span>
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wide">{product.category}</span>
          </div>
          <h3 className="line-clamp-2 text-sm font-bold text-slate-900 sm:text-base">{product.title}</h3>
          <p className="text-lg font-black text-amber-600 sm:text-xl">{dollars(product.priceCents)}</p>
        </div>
        <p className="text-xs text-slate-500">{shippingText}</p>
        {product.pickupAvailable&&product.pickupCity&&<p className="text-xs font-medium text-emerald-700">{t('product.pickupIn', { location: pickupLocation })}</p>}
        {typeof product.inventory === 'number' && product.inventory > 0 && product.inventory <= 5 && product.status === 'APPROVED' && (
          <p className="text-xs font-semibold text-orange-600">Only {product.inventory} left!</p>
        )}

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
              <UserAvatar
                imageUrl={product.seller?.profileImageUrl ?? null}
                name={product.seller?.shopName?.trim() || product.seller?.name}
                className="h-6 w-6"
              />
              <span className="truncate font-semibold">{product.seller?.shopName?.trim() || t('product.sellerFallback')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${sellerVerified ? 'bg-emerald-100 text-emerald-700' : phoneVerified ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                <ShieldCheck size={12} />
                {sellerBadge}
              </span>
              {!sellerVerified && !phoneVerified && (
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                  {t('product.newSeller')}
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
