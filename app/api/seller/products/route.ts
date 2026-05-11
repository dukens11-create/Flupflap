import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';
import { isSubscriptionActive } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  getListingRiskAssessmentForCandidate,
  shouldRecommendFraudReview,
} from '@/lib/fraud-detection';
import { parseJsonOrNull } from '@/lib/parse-json';

const schema = z.object({
  title: z.string().trim().optional(),
  description: z.string().trim().optional(),
  price: z.string().trim().optional(),
  shipping: z.string().trim().optional(),
  category: z.string().trim().optional(),
  condition: z.string().trim().optional(),
  imageUrl: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  video: z.string().url().optional().or(z.literal('')),
  videoUrl: z.string().url().optional().or(z.literal('')),
  inventory: z.string().trim().optional(),
  inventoryQty: z.string().trim().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().trim().max(100).optional(),
  pickupState: z.string().trim().max(2).optional(),
  pickupPostalCode: z.string().trim().max(20).optional(),
  localPickupAvailable: z.string().optional(),
  localPickupCity: z.string().trim().max(100).optional(),
  localPickupState: z.string().trim().max(2).optional(),
  localPickupPostalCode: z.string().trim().max(20).optional(),
  // Category system
  categoryId: z.string().trim().optional(),
  subcategoryId: z.string().trim().optional(),
  productAttributes: z.string().optional(), // JSON string
});

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, message }, { status });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const products = await prisma.product.findMany({
    where: { sellerId: session.user.id },
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

    // Block restricted sellers from creating new listings
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return jsonError('Your seller account is currently restricted.', 403);
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
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
    const rawEntries = Object.fromEntries(form.entries());
    // Collect multiple "images" values from form (MediaUpload uses multiple hidden inputs)
    const imagesRaw = form.getAll('images').map(String).filter(Boolean);
    const parsed = schema.safeParse({ ...rawEntries, images: imagesRaw.length ? imagesRaw : undefined });
    if (!parsed.success) {
      return jsonError('Invalid input.', 400);
    }
    const data = parsed.data;

    // Resolve images array: prefer multi-images, fall back to legacy imageUrl
    const resolvedImages: string[] = imagesRaw.length
      ? imagesRaw
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
    if (!inventoryRaw || !Number.isInteger(inventoryQty) || inventoryQty < 1) {
      return jsonError('Please enter an inventory quantity of at least 1.', 400);
    }

    if (!data.condition) {
      return jsonError('Please select a condition.', 400);
    }

    let category = data.category ?? '';
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
    const videoUrl = data.videoUrl || data.video || null;
    const pickupAvailable = data.pickupAvailable === 'true' || data.localPickupAvailable === 'true';
    const pickupCity = data.pickupCity || data.localPickupCity || null;
    const pickupState = data.pickupState || data.localPickupState || null;
    const pickupPostalCode = data.pickupPostalCode || data.localPickupPostalCode || null;

    const riskAssessment = await getListingRiskAssessmentForCandidate({
      sellerId: session.user.id,
      title,
      description: data.description || '',
      priceCents: cents(price),
      category,
      condition: data.condition,
      imageUrl: mainImage,
    });

    const product = await prisma.product.create({
      data: {
        title,
        description: data.description || '',
        priceCents: cents(price),
        condition: data.condition,
        category,
        imageUrl: mainImage,
        images: resolvedImages,
        mainImage,
        videoUrl,
        sellerId: session.user.id,
        shippingCents: cents(data.shipping || '0'),
        inventory: inventoryQty,
        status: 'PENDING',
        pickupAvailable,
        pickupCity,
        pickupState,
        pickupPostalCode,
        categoryId: data.categoryId || null,
        subcategoryId: data.subcategoryId || null,
        productAttributes: parseJsonOrNull(data.productAttributes),
      },
    });

    const fraudQuery = shouldRecommendFraudReview(riskAssessment) ? '&fraud=review' : '';
    return NextResponse.json({
      success: true,
      message: 'Listing submitted successfully.',
      redirectTo: `/seller/dashboard?created=${product.id}${fraudQuery}`,
    });
  } catch (err) {
    console.error('[seller/products POST]', err);
    return jsonError('Failed to create listing.', 500);
  }
}
