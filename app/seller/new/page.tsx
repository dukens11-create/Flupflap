import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'List a New Item' };

export default async function SellerNewPage() {
  redirect('/seller/listings/new');
}
