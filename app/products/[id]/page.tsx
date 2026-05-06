import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import AddToCartButton from '@/components/AddToCartButton';
import BuyNowButton from '@/components/BuyNowButton';
import PickupDistance from '@/components/PickupDistance';
import ContactSellerButton from '@/components/ContactSellerButton';
import ReportItemButton from '@/components/ReportItemButton';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await prisma.product.findUnique({ where: { id } });
  return { title: p?.title ?? 'Product not found' };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, session] = await Promise.all([
    prisma.product.findUnique({
      where: { id },
      include: { seller: { select: { id: true, name: true } } },
    }),
    getServerSession(authOptions),
  ]);

  if (!product || product.status !== 'APPROVED') notFound();

  // Hide the message button if the viewer is the seller of this product
  const isOwnListing = session?.user?.id === product.seller.id;

  return (
    <main className="max-w-4xl mx-auto">
      <Link href="/" className="text-sm text-blue-600 hover:underline mb-4 inline-block">← Back to browse</Link>
      <div className="card overflow-hidden flex flex-col md:flex-row gap-0">
        <div className="relative w-full md:w-96 h-72 md:h-auto flex-shrink-0 bg-slate-100">
          <Image src={product.imageUrl} alt={product.title} fill className="object-cover" />
        </div>
        <div className="p-6 flex flex-col gap-4 flex-1">
          <div>
            <p className="text-xs uppercase text-slate-500 font-medium">
              {product.condition} · {product.category}
            </p>
            <h1 className="text-2xl font-black mt-1">{product.title}</h1>
            <p className="text-3xl font-black text-blue-700 mt-2">{dollars(product.priceCents)}</p>
            {product.pickupAvailable ? (
              <p className="text-sm text-slate-500">+ {dollars(product.shippingCents)} shipping <span className="text-green-700 font-medium">or free local pickup</span></p>
            ) : (
              <p className="text-sm text-slate-500">+ {dollars(product.shippingCents)} shipping</p>
            )}
            <p className="text-xs text-slate-400 mt-1">Sold by {product.seller.name}</p>
          </div>
          <p className="text-slate-700 text-sm leading-relaxed">{product.description}</p>

          {/* Pickup distance widget */}
          {product.pickupAvailable && product.pickupCity && product.pickupState && product.pickupPostalCode && (
            <PickupDistance
              pickupCity={product.pickupCity}
              pickupState={product.pickupState}
              pickupPostalCode={product.pickupPostalCode}
            />
          )}
          {product.pickupAvailable && product.pickupCity && product.pickupState && !product.pickupPostalCode && (
            <div className="mt-1 p-3 rounded-xl bg-green-50 border border-green-200 text-sm">
              <div className="flex items-center gap-2 font-semibold text-green-800">
                <span>🏠</span>
                <span>Local pickup available</span>
              </div>
              <p className="text-green-700 mt-0.5">
                Located in <span className="font-medium">{product.pickupCity}, {product.pickupState}</span>
              </p>
            </div>
          )}

          {product.inventory <= 0 ? (
            <p className="text-red-600 font-semibold">Out of stock</p>
          ) : (
            <div className="flex flex-col gap-2">
              <AddToCartButton item={{
                id: product.id,
                title: product.title,
                priceCents: product.priceCents,
                imageUrl: product.imageUrl,
                shippingCents: product.shippingCents,
                pickupAvailable: product.pickupAvailable,
                pickupCity: product.pickupCity ?? undefined,
                pickupState: product.pickupState ?? undefined,
              }} />
              <BuyNowButton productId={product.id} />
              {product.pickupAvailable && (
                <BuyNowButton productId={product.id} isPickup />
              )}
            </div>
          )}
          {product.inventory > 0 && product.inventory <= 3 && (
            <p className="text-orange-600 text-sm font-medium">Only {product.inventory} left!</p>
          )}
          {/* Contact seller — hidden for the seller's own listing */}
          {!isOwnListing && (
            <ContactSellerButton productId={product.id} />
          )}
          {/* Report item — hidden for the seller's own listing */}
          {!isOwnListing && (
            <div className="pt-1">
              <ReportItemButton productId={product.id} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
