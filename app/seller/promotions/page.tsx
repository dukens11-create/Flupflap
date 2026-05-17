import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Promotions',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function SellerPromotionsPage() {
  redirect('/seller?view=promotions');
}
