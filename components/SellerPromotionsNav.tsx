import Link from 'next/link';
import { getPromotionRouteLabel, type PromotionRouteKind } from '@/lib/seller-promotions';

type Props = {
  active?: 'sales' | 'overview' | PromotionRouteKind;
};

function pillClass(active: boolean) {
  return active
    ? 'rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white'
    : 'rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50';
}

export default function SellerPromotionsNav({ active }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/seller/sales" className={pillClass(active === 'sales')}>
        Sales
      </Link>
      <Link href="/seller/promotions" className={pillClass(active === 'overview')}>
        Promotions
      </Link>
      {(['discounts', 'offers'] as PromotionRouteKind[]).map((kind) => (
        <Link
          key={kind}
          href={`/seller/promotions/${kind}`}
          className={pillClass(active === kind)}
        >
          {getPromotionRouteLabel(kind)}
        </Link>
      ))}
    </div>
  );
}
