import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Promotions',
  robots: { index: false, follow: false },
};

export default function SellerPromotionsPage() {
  redirect('/seller?view=promotions');
}
