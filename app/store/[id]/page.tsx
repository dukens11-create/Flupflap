import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma, isDatabaseConfigured } from '@/lib/db';
import ProductCard from '@/components/ProductCard';
import { ShieldCheck, Store } from 'lucide-react';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (!isDatabaseConfigured()) {
    return { title: 'Seller Store' };
  }
  try {
    const { id } = await params;
    const seller = await prisma.user.findUnique({
      where: { id, deletedAt: null, role: 'SELLER' },
      select: { name: true, shopName: true },
    });
    if (!seller) return { title: 'Seller Store' };
    const publicName = seller.shopName?.trim() || 'FlupFlap Seller';
    return {
      title: `${publicName}'s Store`,
      description: `Browse products listed by ${publicName} on FlupFlap Marketplace.`,
    };
  } catch {
    return { title: 'Seller Store' };
  }
}

export default async function SellerStorePage({ params }: Props) {
  if (!isDatabaseConfigured()) {
    return (
      <main className="space-y-6 pb-6">
        <div className="card p-10 text-center text-slate-500">
          <p className="font-semibold text-slate-700 mb-1">Database not configured</p>
          <p className="text-sm">Seller store is unavailable.</p>
        </div>
      </main>
    );
  }

  const { id } = await params;

  type SellerRow = {
    id: string;
    name: string;
    shopName: string | null;
    shopLogoUrl: string | null;
    shopDescription: string | null;
    verificationSubmission: { status: string | null } | null;
  };

  type ProductRow = {
    id: string;
    title: string;
    priceCents: number;
    shippingCents: number;
    condition: string;
    category: string;
    imageUrl: string;
    pickupAvailable: boolean;
    pickupCity: string | null;
    pickupState: string | null;
    cartInterest: { totalAdds: number } | null;
    // activePromotion and sellerResponseRate are expected by ProductCard but are
    // not relevant for the store page view (promotions are not displayed here;
    // response rate is not computed per-product on this page).
    activePromotion: null;
    sellerResponseRate: null;
    seller: {
      id: string;
      name: string;
      shopName: string | null;
      phoneVerified: boolean;
      verificationSubmission: {
        status: string | null;
        eligibleToListAt: Date | null;
        adminFallbackStatus: string | null;
      } | null;
    };
  };

  let seller: SellerRow | null = null;
  let products: ProductRow[] = [];

  try {
    seller = await prisma.user.findUnique({
      where: { id, deletedAt: null, role: 'SELLER' },
      select: {
        id: true,
        name: true,
        shopName: true,
        shopLogoUrl: true,
        shopDescription: true,
        verificationSubmission: { select: { status: true } },
      },
    });

    if (!seller) notFound();

    const rawProducts = await prisma.product.findMany({
      where: { sellerId: id, status: 'APPROVED' },
      orderBy: { createdAt: 'desc' },
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            shopName: true,
            phoneVerified: true,
            verificationSubmission: {
              select: {
                status: true,
                eligibleToListAt: true,
                adminFallbackStatus: true,
              },
            },
          },
        },
        cartInterest: { select: { totalAdds: true } },
      },
    });

    products = rawProducts.map((p) => ({
      ...p,
      activePromotion: null,
      sellerResponseRate: null,
    }));
  } catch {
    notFound();
  }

  if (!seller) notFound();

  const isVerified = seller.verificationSubmission?.status === 'APPROVED';
  const sellerPublicName = seller.shopName?.trim() || 'FlupFlap Seller';

  return (
    <main className="space-y-6 pb-6">
      <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="flex items-center gap-4">
          {seller.shopLogoUrl ? (
            <img
              src={seller.shopLogoUrl}
              alt={`${sellerPublicName} logo`}
              className="h-14 w-14 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-200 text-slate-600">
              <Store size={28} />
            </div>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black tracking-tight text-slate-900">{sellerPublicName}</h1>
              {isVerified && (
                <ShieldCheck size={20} className="text-emerald-600" aria-label="Verified seller" />
              )}
            </div>
            {seller.shopDescription && (
              <p className="text-sm text-slate-600 max-w-lg">{seller.shopDescription}</p>
            )}
            <p className="text-sm text-slate-500">
              {products.length} {products.length === 1 ? 'item' : 'items'} listed
            </p>
          </div>
        </div>
      </section>

      {products.length === 0 ? (
        <div className="rounded-[28px] border border-dashed border-slate-300 bg-white p-10 text-center text-slate-500 shadow-sm">
          This seller has no active listings.
        </div>
      ) : (
        <section className="space-y-4">
          <h2 className="text-xl font-bold text-slate-900">Listings</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {products.map((p) => (
              <ProductCard
                key={p.id}
                p={p}
              />
            ))}
          </div>
        </section>
      )}

      <div className="text-center">
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-800 underline">
          ← Back to browse
        </Link>
      </div>
    </main>
  );
}
