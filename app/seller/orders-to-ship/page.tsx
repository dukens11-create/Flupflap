import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Orders to Ship',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function SellerOrdersToShipPage() {
  redirect('/seller?view=orders-to-ship');
}
