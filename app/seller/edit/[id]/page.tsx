import { redirect, notFound, forbidden } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import { loadCategoryHierarchyNodes, resolveLegacyCategorySelection } from '@/lib/category-hierarchy';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  formatPackageNumber,
  getEffectivePackageDetails,
  getShippingClass,
  hasStoredPackageDetails,
} from '@/lib/product-package';
import {
  canDeleteProductFromEdit,
  canEditProductForSeller,
  getProductEditCancelPath,
  getProductEditDraftPath,
  getProductEditSuccessPath,
} from '@/lib/product-edit-access';
import EditListingForm from './EditListingForm';
import { type ProductSizeType } from '@/lib/product-variants';

export const metadata: Metadata = { title: 'Edit Listing' };

export default async function SellerEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER' && session.user.role !== 'ADMIN') redirect('/');
  const actorRole = session.user.role;
  const actorId = session.user.id;
  if (!actorId) redirect('/login');

  if (actorRole === 'SELLER') {
    const dbUser = await prisma.user.findUnique({ where: { id: actorId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      redirect('/seller');
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: actorId },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      redirect('/seller?verification=required');
    }
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    select: {
      id: true,
      sellerId: true,
      status: true,
      title: true,
      description: true,
      priceCents: true,
      shippingCents: true,
      inventory: true,
      category: true,
      categoryId: true,
      subcategoryId: true,
      productAttributes: true,
      condition: true,
      imageUrl: true,
      images: true,
      originalImages: true,
      enhancedImages: true,
      imageThumbnails: true,
      videoUrl: true,
      weightOz: true,
      weightUnit: true,
      lengthIn: true,
      widthIn: true,
      heightIn: true,
      packageType: true,
      pickupAvailable: true,
      pickupCity: true,
      pickupState: true,
      pickupPostalCode: true,
      productVariants: {
        select: {
          id: true,
          sizeType: true,
          sizeLabel: true,
          waist: true,
          length: true,
          quantity: true,
          isAvailable: true,
        },
      },
    },
  });

  if (!product) notFound();
  if (!canEditProductForSeller(actorRole, actorId, product.sellerId)) forbidden();

  const categories = await loadCategoryHierarchyNodes(prisma);
  const normalizedCategory = resolveLegacyCategorySelection(categories, {
    categoryId: product.categoryId,
    subcategoryId: product.subcategoryId,
    categoryLabel: product.category,
  });

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
  const defaultCategorySlug = normalizedCategory.path.at(-1)?.slug;
  const packageDetails = getEffectivePackageDetails(product);
  const shippingClass = getShippingClass(product.productAttributes) ?? '';
  const shippingSetupIncomplete = !hasStoredPackageDetails(product);

  return (
    <main className="max-w-xl mx-auto">
      <h1 className="text-3xl font-black mb-2">Edit listing</h1>
      <p className="text-sm text-slate-500 mb-6">
        {actorRole === 'ADMIN'
          ? 'Review and update this listing directly.'
          : 'Changes will require re-approval by an admin before going live.'}
      </p>
      <EditListingForm
        id={id}
        canDelete={canDeleteProductFromEdit(actorRole, product.status)}
        cancelHref={getProductEditCancelPath(actorRole)}
        draftRedirectPath={getProductEditDraftPath(actorRole)}
        defaultSuccessPath={getProductEditSuccessPath(actorRole, id)}
        defaultTitle={product.title}
        defaultDescription={product.description}
        defaultPriceDollars={priceDollars}
        defaultShippingDollars={shippingDollars}
        defaultInventory={product.inventory}
        defaultCategoryId={normalizedCategory.categoryId}
        defaultSubcategoryId={normalizedCategory.subcategoryId}
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
        defaultSizeType={(product.productVariants[0]?.sizeType?.toLowerCase() as ProductSizeType | undefined) ?? null}
        defaultVariants={product.productVariants.map((variant) => ({
          ...variant,
          sizeType: variant.sizeType.toLowerCase() as ProductSizeType,
        }))}
      />
    </main>
  );
}
