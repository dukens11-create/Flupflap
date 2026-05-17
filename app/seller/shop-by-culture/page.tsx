import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Shop by Culture',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function SellerShopByCulturePage() {
  redirect('/seller?view=shop-by-culture');
}
