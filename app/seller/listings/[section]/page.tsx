import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import SellerListingsGrid from '@/components/SellerListingsGrid';
import SellerListingsSectionNav from '@/components/SellerListingsSectionNav';
import {
  getSellerListingsPageData,
} from '@/lib/seller-listings';
import {
  filterSellerListingsBySection,
  isSellerListingsSection,
  SELLER_LISTINGS_SECTION_COPY,
} from '@/lib/seller-listings-config';

export const dynamic = 'force-dynamic';

function formatItemCountLabel(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

type Props = {
  params: Promise<{ section: string }>;
  searchParams: Promise<{ created?: string; updated?: string; deleted?: string; fraud?: string }>;
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  if (!isSellerListingsSection(section)) {
    return { title: 'My Listings' };
  }

  return { title: `${SELLER_LISTINGS_SECTION_COPY[section].title} | My Listings` };
}

export default async function SellerListingsSectionPage({ params, searchParams }: Props) {
  const [{ section }, sp] = await Promise.all([params, searchParams]);
  if (!isSellerListingsSection(section)) notFound();

  const { listings, isRestricted } = await getSellerListingsPageData();
  const copy = SELLER_LISTINGS_SECTION_COPY[section];
  const filteredListings = filterSellerListingsBySection(listings, section);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <SellerListingsSectionNav />

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-slate-900">{copy.title}</h1>
            <p className="text-sm text-slate-600">{copy.description}</p>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
            {formatItemCountLabel(filteredListings.length)}
          </span>
        </div>
      </section>

      {sp.created && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ Listing submitted successfully.
        </div>
      )}
      {sp.updated && (
        <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          ✅ Listing updated successfully.
        </div>
      )}
      {sp.deleted && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          🗑️ Listing deleted.
        </div>
      )}
      {sp.fraud === 'review' && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Your latest listing triggered extra trust-and-safety review signals before it can go live.
        </div>
      )}

      <SellerListingsGrid
        listings={filteredListings}
        isRestricted={isRestricted}
        hideFilters
        emptyMessage={copy.emptyMessage}
        searchPlaceholder={copy.searchPlaceholder}
      />
    </main>
  );
}
