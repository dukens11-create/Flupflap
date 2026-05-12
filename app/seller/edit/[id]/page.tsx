import { redirect, notFound, forbidden } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  formatPackageNumber,
  getEffectivePackageDetails,
  getShippingClass,
  hasStoredPackageDetails,
} from '@/lib/product-package';
import EditListingForm from './EditListingForm';

export const metadata: Metadata = { title: 'Edit Listing' };

export default async function SellerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');
  const sellerId = session.user.id;
  if (!sellerId) redirect('/login');

  // Block restricted sellers from editing listings
  const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
  if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
    redirect('/seller');
  }

  const verification = await prisma.sellerVerification.findUnique({
    where: { sellerId },
    select: { status: true },
  });
  if (!isSellerVerificationApproved(verification?.status)) {
    redirect('/seller?verification=required');
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      subcategoryRef: { select: { slug: true } },
      categoryRef: { select: { slug: true } },
    },
  });

  if (!product) notFound();
  if (product.sellerId !== sellerId) forbidden();

  const priceDollars = (product.priceCents / 100).toFixed(2);
  const shippingDollars = (product.shippingCents / 100).toFixed(2);
  const defaultImages = product.images?.length
    ? product.images
    : product.imageUrl
      ? [product.imageUrl]
      : [];
  const defaultOriginalImages = product.originalImages?.length ? product.originalImages : defaultImages;
  const defaultEnhancedImages = product.enhancedImages?.length ? product.enhancedImages : [];
  const defaultImageThumbnails = product.imageThumbnails?.length ? product.imageThumbnails : [];
  // Use the most specific category slug for the condition picker seed value.
  const defaultCategorySlug =
    product.categoryRef?.slug ?? product.subcategoryRef?.slug ?? undefined;
  const packageDetails = getEffectivePackageDetails(product);
  const shippingClass = getShippingClass(product.productAttributes) ?? '';
  const shippingSetupIncomplete = !hasStoredPackageDetails(product);

  return (
    <main className="max-w-xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Edit listing</h1>
      <p className="text-sm text-slate-500 mb-6">
        Changes will require re-approval by an admin before going live.
      </p>
      <EditListingForm
        id={id}
        defaultTitle={product.title}
        defaultDescription={product.description}
        defaultPriceDollars={priceDollars}
        defaultShippingDollars={shippingDollars}
        defaultInventory={product.inventory}
        defaultCategoryId={product.categoryId}
        defaultSubcategoryId={product.subcategoryId}
        defaultAttributes={(product.productAttributes as Record<string, string> | null) ?? undefined}
        defaultCondition={product.condition}
        defaultCategorySlug={defaultCategorySlug}
        defaultImages={defaultImages}
        defaultOriginalImages={defaultOriginalImages}
        defaultEnhancedImages={defaultEnhancedImages}
        defaultImageThumbnails={defaultImageThumbnails}
        defaultVideoUrl={product.videoUrl ?? ''}
        defaultWeight={packageDetails ? formatPackageNumber(packageDetails.weight) : undefined}
        defaultWeightUnit={packageDetails?.weightUnit ?? 'lb'}
        defaultPackageType={packageDetails?.packageType ?? 'PACKAGE'}
        defaultShippingClass={shippingClass || undefined}
        defaultLength={packageDetails ? formatPackageNumber(packageDetails.lengthIn) : undefined}
        defaultWidth={packageDetails ? formatPackageNumber(packageDetails.widthIn) : undefined}
        defaultHeight={packageDetails ? formatPackageNumber(packageDetails.heightIn) : undefined}
        shippingSetupIncomplete={shippingSetupIncomplete}
        defaultPickupAvailable={product.pickupAvailable}
        defaultPickupCity={product.pickupCity}
        defaultPickupState={product.pickupState}
        defaultPickupPostalCode={product.pickupPostalCode}
      />

      {product.status !== 'SOLD' && (
        <div className="mt-6 card p-4 border-red-200">
          <h2 className="font-bold text-red-700 mb-2">Danger zone</h2>
          <p className="text-sm text-slate-500 mb-3">
            Permanently delete this listing. This cannot be undone.
          </p>
          <form action={`/api/seller/products/${id}`} method="POST">
            <input type="hidden" name="_method" value="delete" />
            <button
              type="submit"
              className="btn bg-red-600 hover:bg-red-700 text-white text-sm"
            >
              Delete listing
            </button>
          </form>
        </div>
      )}
    </main>
  );
}
