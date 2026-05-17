import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'My Listings',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SellerMyListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const sp = await searchParams;
  const state = sp.state ? `&state=${encodeURIComponent(sp.state)}` : '';
  redirect(`/seller?view=my-listings${state}`);
}
