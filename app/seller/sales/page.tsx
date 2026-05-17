import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sales',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function SellerSalesPage() {
  redirect('/seller?view=sales');
}
