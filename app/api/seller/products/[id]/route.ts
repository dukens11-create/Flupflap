import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  getListingRiskAssessmentForCandidate,
  shouldRecommendFraudReview,
} from '@/lib/fraud-detection';
import { parseJsonOrNull } from '@/lib/parse-json';
import { SHIPPING_MODES } from '@/app/api/seller/products/route';
import {
  convertWeightToOunces,
  getShippingClass,
  normalizeWeightUnit,
  setShippingClass,
  SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE,
} from '@/lib/product-package';

const optionalInputString = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return undefined;
}, z.string().optional());

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  price: z.string().optional(),
  shipping: z.string().optional(),
  shippingMode: z.string().optional(), // 'FLAT' | 'FREE' | 'CALCULATED'
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  images: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  originalImages: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  enhancedImages: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  imageThumbnails: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().max(100).optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(20).optional(),
  // Package dimensions
  weight: optionalInputString,
  packageWeight: optionalInputString,
  weightOz: optionalInputString,
  weightUnit: optionalInputString,
  packageWeightUnit: optionalInputString,
  length: optionalInputString,
  packageLength: optionalInputString,
  lengthIn: optionalInputString,
  width: optionalInputString,
  packageWidth: optionalInputString,
  widthIn: optionalInputString,
  height: optionalInputString,
  packageHeight: optionalInputString,
  heightIn: optionalInputString,
  packageDimensionUnit: optionalInputString,
  packageType: optionalInputString,
  shippingClass: optionalInputString,
  // Category system
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  productAttributes: z.string().optional(), // JSON string
});

type ProductUpdateInput = z.infer<typeof updateSchema>;

type ExistingProduct = NonNullable<Awaited<ReturnType<typeof getOwnedSellerProduct>>['product']>;

async function getOwnedSellerProduct(id: string, sellerId: string) {
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return { product: null, forbidden: false };
  if (product.sellerId !== sellerId) return { product: null, forbidden: true };
  return { product, forbidden: false };
}

/**
 * Resolve the images array from form/JSON data, falling back to the existing
 * product's images or imageUrl.
 */
function resolveImages(submitted: string[] | null, existing: ExistingProduct): string[] {
  if (submitted && submitted.length > 0) return submitted;
  if (existing.images?.length) return existing.images;
  if (existing.imageUrl) return [existing.imageUrl];
  return [];
}

/**
 * Resolve the video URL: if the caller provides a value, use it (empty string → null).
 * If the caller provides nothing (undefined), keep the existing value.
 * Note: videoUrl is already validated as a URL by the Zod schema when non-empty.
 */
function resolveVideoUrl(submitted: string | undefined, existing: ExistingProduct): string | null {
  if (submitted === undefined) return existing.videoUrl ?? null;
  return submitted || null;
}

function toUrlArray(
  value: string | string[] | undefined,
  fallback: string[] = [],
): string[] {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value) return [value];
  return fallback;
}

function getFirstNonEmptyString(...values: Array<string | undefined>) {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0);
}

function parsePositiveNumber(value?: string | null) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Unknown error.';
}

function redirectToEditForm(req: Request, id: string, message: string) {
  const url = new URL(`/seller/edit/${id}`, req.url);
  url.searchParams.set('error', message);
  return NextResponse.redirect(url, 303);
}

function resolveSubmittedPackageDetails(data: ProductUpdateInput) {
  const weightValue = getFirstNonEmptyString(data.weight, data.packageWeight, data.weightOz);
  const hasLegacyWeightInput = !getFirstNonEmptyString(data.weight, data.packageWeight) && !!data.weightOz?.trim();
  const weightUnit = hasLegacyWeightInput
    ? 'oz'
    : normalizeWeightUnit(getFirstNonEmptyString(data.weightUnit, data.packageWeightUnit));
  const weight = parsePositiveNumber(weightValue);
  const lengthIn = parsePositiveNumber(getFirstNonEmptyString(data.length, data.packageLength, data.lengthIn));
  const widthIn = parsePositiveNumber(getFirstNonEmptyString(data.width, data.packageWidth, data.widthIn));
  const heightIn = parsePositiveNumber(getFirstNonEmptyString(data.height, data.packageHeight, data.heightIn));

  if (!weight || !lengthIn || !widthIn || !heightIn) {
    return null;
  }

  return {
    weightUnit,
    weightOz: convertWeightToOunces(weight, weightUnit),
    lengthIn,
    widthIn,
    heightIn,
    packageType: data.packageType?.trim() || null,
    shippingClass: data.shippingClass?.trim() || null,
  };
}

function getPackageDetailsErrorMessage(data: ProductUpdateInput) {
  const distanceUnit = data.packageDimensionUnit?.trim().toLowerCase();
  if (distanceUnit && distanceUnit !== 'in') {
    return 'Only inches (in) are supported for package dimensions.';
  }
  return SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE;
}

function resolveOriginalImagesForProduct(
  submittedOriginalImages: string[] | null,
  resolvedImages: string[],
  existing: ExistingProduct,
): string[] {
  if (submittedOriginalImages?.length === resolvedImages.length) {
    return submittedOriginalImages;
  }
  if (existing.originalImages?.length === resolvedImages.length) {
    return existing.originalImages;
  }
  return resolvedImages.map((selectedImageUrl, index) => {
    if (existing.originalImages?.[index]) {
      return existing.originalImages[index];
    }
    const matchedEnhancedIndex = existing.enhancedImages?.findIndex((url) => url === selectedImageUrl) ?? -1;
    if (matchedEnhancedIndex >= 0 && existing.originalImages?.[matchedEnhancedIndex]) {
      return existing.originalImages[matchedEnhancedIndex];
    }
    return selectedImageUrl;
  });
}

function buildListingRiskCandidate(
  sellerId: string,
  existing: ExistingProduct,
  data: ProductUpdateInput,
  resolvedImgs: string[],
) {
  const mainImage = resolvedImgs[0] ?? data.imageUrl ?? existing.imageUrl;
  return {
    sellerId,
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    priceCents: data.price ? cents(data.price) : existing.priceCents,
    category: data.category ?? existing.category,
    condition: data.condition ?? existing.condition,
    imageUrl: mainImage,
  };
}

/** POST handles both edits (_method=update) and deletes (_method=delete) via HTML forms */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let id = '';
  let sellerId: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.redirect(new URL('/login', req.url), 303);
    }
    sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.redirect(new URL('/login', req.url), 303);
    }
    ({ id } = await params);

    // Block restricted sellers from editing or deleting listings
    const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      return redirectToEditForm(req, id, 'Your seller account is currently restricted.');
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return redirectToEditForm(
        req,
        id,
        'Submit and pass seller verification before listing products.',
      );
    }

    const { product: existing, forbidden } = await getOwnedSellerProduct(id, sellerId);
    if (forbidden) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const method = (form.get('_method') as string)?.toLowerCase();

    if (method === 'delete') {
      if (existing.status === 'SOLD') {
        return NextResponse.json({ error: 'Cannot delete a sold item.' }, { status: 400 });
      }
      await prisma.product.delete({ where: { id } });
      return NextResponse.redirect(new URL('/seller?deleted=1', req.url));
    }

    // Default: update
    const rawEntries = Object.fromEntries(form.entries());
    const imagesRaw = form.getAll('images').map(String).filter(Boolean);
    const originalImagesRaw = form.getAll('originalImages').map(String).filter(Boolean);
    const enhancedImagesRaw = form.getAll('enhancedImages').map(String).filter(Boolean);
    const imageThumbnailsRaw = form.getAll('imageThumbnails').map(String).filter(Boolean);
    const data = updateSchema.parse({
      ...rawEntries,
      images: imagesRaw.length ? imagesRaw : undefined,
      originalImages: originalImagesRaw.length ? originalImagesRaw : undefined,
      enhancedImages: enhancedImagesRaw.length ? enhancedImagesRaw : undefined,
      imageThumbnails: imageThumbnailsRaw.length ? imageThumbnailsRaw : undefined,
    });
    const packageDetails = resolveSubmittedPackageDetails(data);
    if (!packageDetails) {
      return redirectToEditForm(req, id, getPackageDetailsErrorMessage(data));
    }

    const submittedImages = imagesRaw.length ? imagesRaw : data.imageUrl ? [data.imageUrl] : null;
    const resolvedImages = resolveImages(submittedImages, existing);
    const mainImage = resolvedImages[0] ?? existing.imageUrl;
    const videoUrl = resolveVideoUrl(data.videoUrl, existing);
    const resolvedOriginalImages = resolveOriginalImagesForProduct(
      originalImagesRaw.length ? originalImagesRaw : null,
      resolvedImages,
      existing,
    );
    const resolvedEnhancedImages =
      enhancedImagesRaw.length > 0 ? enhancedImagesRaw.slice(0, resolvedImages.length) : existing.enhancedImages ?? [];
    const resolvedImageThumbnails =
      imageThumbnailsRaw.length > 0
        ? imageThumbnailsRaw.slice(0, resolvedImages.length)
        : existing.imageThumbnails ?? [];

    const riskAssessment = await getListingRiskAssessmentForCandidate(
      buildListingRiskCandidate(sellerId, existing, data, resolvedImages),
      id,
    );
    const nextProductAttributes = setShippingClass(
      data.productAttributes === undefined ? existing.productAttributes : parseJsonOrNull(data.productAttributes),
      packageDetails.shippingClass,
    );
    const nextProductAttributesValue =
      Object.keys(nextProductAttributes).length === 0
        ? Prisma.JsonNull
        : (nextProductAttributes as Prisma.InputJsonValue);

    let updated;
    try {
      updated = await prisma.product.update({
        where: { id },
        data: {
          ...(data.title && { title: data.title }),
          ...(data.description && { description: data.description }),
          ...(data.price && { priceCents: cents(data.price) }),
          ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
          ...(data.shippingMode && (SHIPPING_MODES as readonly string[]).includes(data.shippingMode) && { shippingMode: data.shippingMode }),
          ...(data.category && { category: data.category }),
          ...(data.condition && { condition: data.condition }),
          ...(data.inventory && { inventory: Number(data.inventory) }),
          pickupAvailable: data.pickupAvailable === 'true',
          pickupCity: data.pickupCity || null,
          pickupState: data.pickupState || null,
          pickupPostalCode: data.pickupPostalCode || null,
          // Package dimensions
          weightOz: packageDetails.weightOz,
          weightUnit: packageDetails.weightUnit,
          lengthIn: packageDetails.lengthIn,
          widthIn: packageDetails.widthIn,
          heightIn: packageDetails.heightIn,
          packageType: packageDetails.packageType,
          // Category system fields
          categoryId: data.categoryId || null,
          subcategoryId: data.subcategoryId || null,
          productAttributes: nextProductAttributesValue,
          imageUrl: mainImage,
          images: resolvedImages,
          mainImage,
          videoUrl,
          originalImages: resolvedOriginalImages,
          enhancedImages: resolvedEnhancedImages,
          imageThumbnails: resolvedImageThumbnails,
          // Reset to PENDING on edit so admin can re-review
          status: 'PENDING',
        },
      });
    } catch (dbError) {
      const message = getErrorMessage(dbError);
      console.error('[seller/products/[id] POST] database update error', { productId: id, sellerId, message });
      if (dbError instanceof Error && dbError.stack) {
        console.error('[seller/products/[id] POST] stack trace', dbError.stack);
      }
      return redirectToEditForm(req, id, 'Unable to save listing changes. Please review the form and try again.');
    }

    const fraudQuery = shouldRecommendFraudReview(riskAssessment) ? '&fraud=review' : '';

    return NextResponse.redirect(new URL(`/seller?updated=${updated.id}${fraudQuery}`, req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return redirectToEditForm(req, id, 'Please review the listing details and try again.');
    }
    const message = getErrorMessage(err);
    console.error('[seller/products/[id] POST] request handling error', { productId: id, sellerId, message });
    if (err instanceof Error && err.stack) {
      console.error('[seller/products/[id] POST] stack trace', err.stack);
    }
    return redirectToEditForm(req, id, 'Unable to save listing changes. Please try again.');
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers from editing or deleting listings
    const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return NextResponse.json(
        { error: 'Submit and pass seller verification before listing products.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const { product: existing, forbidden } = await getOwnedSellerProduct(id, sellerId);
    if (forbidden) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const body: unknown = await req.json();
    const data = updateSchema.parse(body);
    const packageDetails = resolveSubmittedPackageDetails(data);
    if (!packageDetails) {
      return NextResponse.json({ error: getPackageDetailsErrorMessage(data) }, { status: 400 });
    }

    // Resolve images for PATCH (JSON body): prefer explicit images list, then legacy imageUrl
    let imagesInput: string[] | null = null;
    if (Array.isArray(data.images) && data.images.length > 0) {
      imagesInput = data.images;
    } else if (typeof data.images === 'string' && data.images) {
      imagesInput = [data.images];
    } else if (data.imageUrl) {
      imagesInput = [data.imageUrl];
    }
    const resolvedImages = resolveImages(imagesInput, existing);
    const mainImage = resolvedImages[0] ?? existing.imageUrl;
    const videoUrl = resolveVideoUrl(data.videoUrl, existing);
    const originalImagesFallback = resolveOriginalImagesForProduct(null, resolvedImages, existing);
    const resolvedOriginalImages = toUrlArray(data.originalImages, originalImagesFallback);
    const resolvedEnhancedImages = toUrlArray(data.enhancedImages, existing.enhancedImages ?? []).slice(
      0,
      resolvedImages.length,
    );
    const resolvedImageThumbnails = toUrlArray(data.imageThumbnails, existing.imageThumbnails ?? []).slice(
      0,
      resolvedImages.length,
    );

    const riskAssessment = await getListingRiskAssessmentForCandidate(
      buildListingRiskCandidate(sellerId, existing, data, resolvedImages),
      id,
    );
    const parsedAttributes = data.productAttributes === undefined
      ? existing.productAttributes
      : parseJsonOrNull(data.productAttributes);
    const nextProductAttributes = setShippingClass(
      parsedAttributes,
      data.shippingClass !== undefined ? packageDetails.shippingClass : getShippingClass(parsedAttributes),
    );
    const nextProductAttributesValue =
      Object.keys(nextProductAttributes).length === 0
        ? Prisma.JsonNull
        : (nextProductAttributes as Prisma.InputJsonValue);

    let updated;
    try {
      updated = await prisma.product.update({
        where: { id },
        data: {
          ...(data.title && { title: data.title }),
          ...(data.description && { description: data.description }),
          ...(data.price && { priceCents: cents(data.price) }),
          ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
          ...(data.shippingMode && (SHIPPING_MODES as readonly string[]).includes(data.shippingMode) && { shippingMode: data.shippingMode }),
          ...(data.category && { category: data.category }),
          ...(data.condition && { condition: data.condition }),
          imageUrl: mainImage,
          images: resolvedImages,
          mainImage,
          videoUrl,
          originalImages: resolvedOriginalImages,
          enhancedImages: resolvedEnhancedImages,
          imageThumbnails: resolvedImageThumbnails,
          ...(data.inventory && { inventory: Number(data.inventory) }),
          ...(data.pickupAvailable !== undefined && { pickupAvailable: data.pickupAvailable === 'true' }),
          ...(data.pickupCity !== undefined && { pickupCity: data.pickupCity || null }),
          ...(data.pickupState !== undefined && { pickupState: data.pickupState || null }),
          ...(data.pickupPostalCode !== undefined && { pickupPostalCode: data.pickupPostalCode || null }),
          // Package dimensions
          weightOz: packageDetails.weightOz,
          weightUnit: packageDetails.weightUnit,
          lengthIn: packageDetails.lengthIn,
          widthIn: packageDetails.widthIn,
          heightIn: packageDetails.heightIn,
          packageType: packageDetails.packageType,
          // Category system fields
          categoryId: data.categoryId || null,
          subcategoryId: data.subcategoryId || null,
          productAttributes: nextProductAttributesValue,
          status: 'PENDING',
        },
      });
    } catch (dbError) {
      const message = getErrorMessage(dbError);
      console.error('[seller/products/[id] PATCH] database update error', { productId: id, sellerId, message });
      if (dbError instanceof Error && dbError.stack) {
        console.error('[seller/products/[id] PATCH] stack trace', dbError.stack);
      }
      return NextResponse.json({ error: 'Failed to update listing.' }, { status: 500 });
    }

    return NextResponse.json({
      ...updated,
      fraudReviewRecommended: shouldRecommendFraudReview(riskAssessment),
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    const message = getErrorMessage(err);
    console.error('[seller/products/[id] PATCH] request handling error', { message });
    if (err instanceof Error && err.stack) {
      console.error('[seller/products/[id] PATCH] stack trace', err.stack);
    }
    return NextResponse.json({ error: 'Failed to update listing.' }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { product: existing, forbidden } = await getOwnedSellerProduct(id, sellerId);
    if (forbidden) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }
    if (existing.status === 'SOLD') {
      return NextResponse.json({ error: 'Cannot delete a sold item.' }, { status: 400 });
    }

    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[seller/products/[id] DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete listing.' }, { status: 500 });
  }
}
