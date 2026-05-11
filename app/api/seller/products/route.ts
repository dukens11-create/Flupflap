import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { isSubscriptionActive } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  getListingRiskAssessmentForCandidate,
  shouldRecommendFraudReview,
} from '@/lib/fraud-detection';
import { parseJsonOrNull } from '@/lib/parse-json';

export const SHIPPING_MODES = ['FLAT', 'FREE', 'CALCULATED'] as const;
type ShippingMode = typeof SHIPPING_MODES[number];

const schema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  price: z.string().trim().optional(),
  shipping: z.string().trim().optional(),
  shippingPrice: z.string().trim().optional(),
  shippingMode: z.string().trim().optional(), // 'FLAT' | 'FREE' | 'CALCULATED'
  category: z.string().trim().optional(),
  subcategory: z.string().trim().optional(),
  refineCategory: z.string().trim().optional(),
  condition: z.string().trim().optional(),
  imageUrl: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  imageUrls: z.array(z.string().url()).optional(),
  originalImages: z.array(z.string().url()).optional(),
  enhancedImages: z.array(z.string().url()).optional(),
  imageThumbnails: z.array(z.string().url()).optional(),
  video: z.string().url().optional().or(z.literal('')),
  videoUrl: z.string().url().optional().or(z.literal('')),
  inventory: z.string().trim().optional(),
  inventoryQty: z.string().trim().optional(),
  brand: z.string().trim().optional(),
  sizeMl: z.string().trim().optional(),
  fragranceType: z.string().trim().optional(),
  gender: z.string().trim().optional(),
  sellerId: z.string().trim().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().trim().max(100).optional(),
  pickupState: z.string().trim().max(2).optional(),
  pickupPostalCode: z.string().trim().max(20).optional(),
  localPickupAvailable: z.string().optional(),
  localPickupCity: z.string().trim().max(100).optional(),
  localPickupState: z.string().trim().max(2).optional(),
  localPickupPostalCode: z.string().trim().max(20).optional(),
  // Package dimensions for live shipping rate calculation
  weightOz: z.string().trim().optional(),
  lengthIn: z.string().trim().optional(),
  widthIn: z.string().trim().optional(),
  heightIn: z.string().trim().optional(),
  packageType: z.string().trim().optional(),
  // Category system
  categoryId: z.string().trim().optional(),
  subcategoryId: z.string().trim().optional(),
  productAttributes: z.string().optional(), // JSON string
  mediaEnhancements: z.string().optional(),
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return 'Unknown error.';
}

function toLogSafeObject(entries: IterableIterator<[string, FormDataEntryValue]>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of entries) {
    if (value instanceof File) {
      out[key] = { fileName: value.name, size: value.size, type: value.type };
      continue;
    }
    out[key] = value;
  }
  return out;
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const sellerId = session.user.id;
  if (!sellerId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    where: { sellerId },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(products);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return jsonError('Forbidden', 403);
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return jsonError('Forbidden', 403);
    }

    // Block restricted sellers from creating new listings
    const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      return jsonError('Your seller account is currently restricted.', 403);
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return jsonError('Submit and pass seller verification before listing products.', 403);
    }

    // Require an active subscription to list items
    if (!dbUser) {
      return jsonError('An active seller subscription is required to list items.', 403);
    }
    let effectiveUser = dbUser;
    if (!isSubscriptionActive(effectiveUser) && effectiveUser.stripeCustomerId) {
      try {
        const synced = await syncSellerSubscriptionFromStripe(effectiveUser.id);
        if (synced) {
          effectiveUser = {
            ...effectiveUser,
            ...synced,
          };
        }
      } catch (err) {
        console.error('[seller/products POST] subscription recovery sync failed:', err);
      }
    }
    if (!isSubscriptionActive(effectiveUser)) {
      return jsonError('An active seller subscription is required to list items.', 403);
    }

    const form = await req.formData();
    const incomingBody = toLogSafeObject(form.entries());
    console.info('[seller/products POST] incoming request body', incomingBody);
    const rawEntries = Object.fromEntries(form.entries());
    // Collect multiple "images" values from form (MediaUpload uses multiple hidden inputs)
    const imagesRaw = form.getAll('images').map(String).filter(Boolean);
    const imageUrlsRaw = form.getAll('imageUrls').map(String).filter(Boolean);
    const originalImagesRaw = form.getAll('originalImages').map(String).filter(Boolean);
    const enhancedImagesRaw = form.getAll('enhancedImages').map(String).filter(Boolean);
    const imageThumbnailsRaw = form.getAll('imageThumbnails').map(String).filter(Boolean);
    const parsed = schema.safeParse({
      ...rawEntries,
      images: imagesRaw.length ? imagesRaw : undefined,
      imageUrls: imageUrlsRaw.length ? imageUrlsRaw : undefined,
      originalImages: originalImagesRaw.length ? originalImagesRaw : undefined,
      enhancedImages: enhancedImagesRaw.length ? enhancedImagesRaw : undefined,
      imageThumbnails: imageThumbnailsRaw.length ? imageThumbnailsRaw : undefined,
    });
    if (!parsed.success) {
      return jsonError(parsed.error.issues[0]?.message ?? 'Invalid input.', 400);
    }
    const data = parsed.data;

    // Resolve images array: prefer multi-images/imageUrls, fall back to legacy imageUrl
    const resolvedImages: string[] = imagesRaw.length
      ? imagesRaw
      : imageUrlsRaw.length
        ? imageUrlsRaw
      : data.imageUrl
        ? [data.imageUrl]
        : [];
    if (resolvedImages.length < 1) {
      return jsonError('Please upload at least 1 product image.', 400);
    }
    if (resolvedImages.length > 6) {
      return jsonError('You can upload up to 6 product images.', 400);
    }

    const title = data.title ?? '';
    if (!title) {
      return jsonError('Please enter a product title.', 400);
    }

    const price = data.price ?? '';
    if (!price || Number.isNaN(Number(price)) || Number(price) <= 0) {
      return jsonError('Please enter a valid price.', 400);
    }

    const inventoryRaw = data.inventoryQty || data.inventory || '';
    const inventoryQty = Number(inventoryRaw);
    if (!inventoryRaw || Number.isNaN(inventoryQty) || !Number.isInteger(inventoryQty) || inventoryQty < 1 || inventoryQty > 9999) {
      return jsonError('Please enter an inventory quantity between 1 and 9999.', 400);
    }

    if (!data.condition) {
      return jsonError('Please select a condition.', 400);
    }

    const shippingRaw = data.shippingPrice || data.shipping || '0';
    const shippingValue = Number(shippingRaw);
    if (Number.isNaN(shippingValue) || shippingValue < 0) {
      return jsonError('Please enter a valid shipping price.', 400);
    }

    // Resolve shipping mode — defaults to CALCULATED for new listings with no explicit flat rate
    const resolvedShippingMode: ShippingMode = (() => {
      if (data.shippingMode && (SHIPPING_MODES as readonly string[]).includes(data.shippingMode)) {
        return data.shippingMode as ShippingMode;
      }
      // Legacy: if a non-zero flat shipping price was supplied without mode, treat as FLAT
      if (shippingValue > 0) return 'FLAT';
      return 'CALCULATED';
    })();

    // Parse package dimensions (optional; not required to create a listing)
    const weightOz = data.weightOz ? Number(data.weightOz) : null;
    const lengthIn = data.lengthIn ? Number(data.lengthIn) : null;
    const widthIn = data.widthIn ? Number(data.widthIn) : null;
    const heightIn = data.heightIn ? Number(data.heightIn) : null;
    const packageType = data.packageType?.trim() || null;

    const attributes = parseJsonOrNull(data.productAttributes);
    const mediaEnhancements = parseJsonOrNull(data.mediaEnhancements);
    const normalizedAttributes: Record<string, unknown> =
      attributes && typeof attributes === 'object' && !Array.isArray(attributes)
        ? { ...(attributes as Record<string, unknown>) }
        : {};
    if (data.brand) normalizedAttributes.brand = data.brand;
    if (data.sizeMl) {
      normalizedAttributes.size_ml = data.sizeMl;
    }
    if (data.fragranceType) {
      normalizedAttributes.fragrance_type = data.fragranceType;
    }
    if (data.gender) normalizedAttributes.gender = data.gender;
    if (mediaEnhancements) normalizedAttributes.mediaEnhancements = mediaEnhancements;
    const productAttributesValue: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined =
      Object.keys(normalizedAttributes).length > 0
        ? (normalizedAttributes as Prisma.InputJsonValue)
        : attributes === null || attributes === undefined
          ? undefined
          : (attributes as Prisma.InputJsonValue);

    let category = data.category ?? data.refineCategory ?? data.subcategory ?? '';
    if (!category && data.categoryId) {
      const categoryRecord = await prisma.category.findUnique({
        where: { id: data.categoryId },
        select: { name: true },
      });
      category = categoryRecord?.name ?? '';
    }
    if (!category) {
      return jsonError('Please select a category.', 400);
    }

    const mainImage = resolvedImages[0] ?? '';
    const resolvedOriginalImages =
      originalImagesRaw.length === resolvedImages.length ? originalImagesRaw : resolvedImages;
    const resolvedEnhancedImages = enhancedImagesRaw.slice(0, resolvedImages.length);
    const resolvedImageThumbnails = imageThumbnailsRaw.slice(0, resolvedImages.length);
    const videoUrl = data.videoUrl || data.video || null;
    const pickupAvailable = data.pickupAvailable === 'true' || data.localPickupAvailable === 'true';
    const pickupCity = data.pickupCity || data.localPickupCity || null;
    const pickupState = data.pickupState || data.localPickupState || null;
    const pickupPostalCode = data.pickupPostalCode || data.localPickupPostalCode || null;
    const categoryRef = data.categoryId
      ? await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true, name: true } })
      : null;
    const subcategoryRef = data.subcategoryId
      ? await prisma.category.findUnique({
          where: { id: data.subcategoryId },
          select: { id: true, name: true, parentId: true },
        })
      : null;
    const safeCategoryId = categoryRef?.id ?? null;
    const safeSubcategoryId =
      subcategoryRef?.id && (!safeCategoryId || subcategoryRef.parentId === safeCategoryId)
        ? subcategoryRef.id
        : null;
    const subcategoryName = subcategoryRef?.name ?? data.subcategory ?? null;
    const refineCategoryName = data.refineCategory ?? null;

    const loggingPayload = {
      title,
      description: data.description || '',
      price,
      shippingPrice: shippingRaw,
      category,
      subcategory: subcategoryName,
      refineCategory: refineCategoryName,
      condition: data.condition,
      brand: (normalizedAttributes.brand as string | undefined) ?? null,
      sizeMl: (normalizedAttributes.size_ml as string | undefined) ?? null,
      fragranceType: (normalizedAttributes.fragrance_type as string | undefined) ?? null,
      gender: (normalizedAttributes.gender as string | undefined) ?? null,
      inventoryQty,
      imageUrls: resolvedImages,
      originalImages: resolvedOriginalImages,
      enhancedImages: resolvedEnhancedImages,
      imageThumbnails: resolvedImageThumbnails,
      videoUrl,
      sellerId: `${sellerId.slice(0, 6)}…`,
    };
    console.info('[seller/products POST] validated payload', loggingPayload);

    const riskAssessment = await getListingRiskAssessmentForCandidate({
      sellerId,
      title,
      description: data.description || '',
      priceCents: cents(price),
      category,
      condition: data.condition,
      imageUrl: mainImage,
    });

    let product;
    try {
      product = await prisma.product.create({
        data: {
          title,
          description: data.description || '',
          priceCents: cents(price),
          condition: data.condition,
          category,
          imageUrl: mainImage,
          images: resolvedImages,
          originalImages: resolvedOriginalImages,
          enhancedImages: resolvedEnhancedImages,
          imageThumbnails: resolvedImageThumbnails,
          mainImage,
          videoUrl,
          sellerId,
          shippingCents: resolvedShippingMode === 'FREE' ? 0 : cents(shippingRaw),
          shippingMode: resolvedShippingMode,
          inventory: inventoryQty,
          status: 'PENDING',
          pickupAvailable,
          pickupCity,
          pickupState,
          pickupPostalCode,
          categoryId: safeCategoryId,
          subcategoryId: safeSubcategoryId,
          productAttributes: productAttributesValue,
          weightOz: weightOz && Number.isFinite(weightOz) && weightOz > 0 ? weightOz : null,
          lengthIn: lengthIn && Number.isFinite(lengthIn) && lengthIn > 0 ? lengthIn : null,
          widthIn: widthIn && Number.isFinite(widthIn) && widthIn > 0 ? widthIn : null,
          heightIn: heightIn && Number.isFinite(heightIn) && heightIn > 0 ? heightIn : null,
          packageType,
        },
      });
    } catch (dbError) {
      const dbMessage = getErrorMessage(dbError);
      console.error('[seller/products POST] database create error', dbMessage);
      if (dbError instanceof Error && dbError.stack) {
        console.error('[seller/products POST] stack trace', dbError.stack);
      }
      return jsonError(`Database validation failed: ${dbMessage}`, 500);
    }

    const fraudQuery = shouldRecommendFraudReview(riskAssessment) ? '&fraud=review' : '';
    return NextResponse.json({
      success: true,
      message: 'Listing submitted successfully.',
      redirectTo: `/seller/dashboard?created=${product.id}${fraudQuery}`,
    });
  } catch (err) {
    const message = getErrorMessage(err);
    console.error('[seller/products POST] request handling error', message);
    if (err instanceof Error && err.stack) {
      console.error('[seller/products POST] stack trace', err.stack);
    }
    return jsonError(message, 500);
  }
}
