'use client';
import Link from 'next/link';
import Image from 'next/image';
import { dollars } from '@/lib/money';
import { useI18n } from '@/components/I18nProvider';
import RatingStars from '@/components/RatingStars';
import { formatAverageRating } from '@/lib/reviews';
export default function ProductCard({p}:{p:any}){
  const { t } = useI18n();
  const isFeatured = !!p.activePromotion;
  const pickupLocation = `${p.pickupCity}${p.pickupState ? `, ${p.pickupState}` : ''}`;
  const reviewAverage = p.reviewSummary?.average ?? null;
  const reviewCount = p.reviewSummary?.count ?? 0;
  return (
    <div className={`card overflow-hidden ${isFeatured ? 'ring-2 ring-yellow-400' : ''}`}>
      <div className="relative h-52 bg-slate-100">
        <Image src={p.imageUrl} alt={p.title} fill className="object-cover"/>
        {isFeatured && (
          <span className="absolute top-2 left-2 badge bg-yellow-400 text-yellow-900 text-xs font-bold shadow-sm">{t('product.sponsored')}</span>
        )}
      </div>
      <div className="p-4">
        <p className="text-xs uppercase text-slate-500">{p.condition} • {p.category}</p>
        <h3 className="font-bold text-lg line-clamp-1">{p.title}</h3>
        <p className="font-black text-blue-700">{dollars(p.priceCents)}</p>
        <p className="text-xs text-slate-500">{t('product.shipping', { amount: dollars(p.shippingCents || 0) })}</p>
        {p.pickupAvailable&&p.pickupCity&&<p className="text-xs text-green-700 font-medium mt-0.5">{t('product.pickupIn', { location: pickupLocation })}</p>}
        {reviewCount > 0 && reviewAverage !== null ? (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-600">
            <RatingStars rating={reviewAverage} />
            <span className="font-semibold text-slate-800">{formatAverageRating(reviewAverage)}</span>
            <span>({reviewCount})</span>
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No reviews yet</p>
        )}
        <Link className="mt-3 inline-block btn-primary" href={`/products/${p.id}`}>{t('product.viewItem')}</Link>
      </div>
    </div>
  );
}
