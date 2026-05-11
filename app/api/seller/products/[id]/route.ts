import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import {
  getListingRiskAssessmentForCandidate,
  shouldRecommendFraudReview,
} from '@/lib/fraud-detection';
import { parseJsonOrNull } from '@/lib/parse-json';

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  price: z.string().optional(),
  shipping: z.string().optional(),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  images: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  videoUrl: z.string().url().optional().or(z.literal('')),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().max(100).optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(20).optional(),
  // Category system
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
  productAttributes: z.string().optional(), // JSON string
});

type ProductUpdateInput = z.infer<typeof updateSchema>;

type ExistingProduct = NonNullable<Awaited<ReturnType<typeof getSellerProduct>>>;

async function getSellerProduct(id: string, sellerId: string) {
  return prisma.product.findFirst({ where: { id, sellerId } });
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
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers from editing or deleting listings
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return NextResponse.json(
        { error: 'Submit and pass seller verification before listing products.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const existing = await getSellerProduct(id, session.user.id);
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
    const data = updateSchema.parse({ ...rawEntries, images: imagesRaw.length ? imagesRaw : undefined });

    const submittedImages = imagesRaw.length ? imagesRaw : data.imageUrl ? [data.imageUrl] : null;
    const resolvedImages = resolveImages(submittedImages, existing);
    const mainImage = resolvedImages[0] ?? existing.imageUrl;
    const videoUrl = resolveVideoUrl(data.videoUrl, existing);

    const riskAssessment = await getListingRiskAssessmentForCandidate(
      buildListingRiskCandidate(session.user.id, existing, data, resolvedImages),
      id,
    );

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.price && { priceCents: cents(data.price) }),
        ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
        ...(data.category && { category: data.category }),
        ...(data.condition && { condition: data.condition }),
        imageUrl: mainImage,
        images: resolvedImages,
        mainImage,
        videoUrl,
        ...(data.inventory && { inventory: Number(data.inventory) }),
        // Pickup fields — always written on form submit so we can clear them
        pickupAvailable: data.pickupAvailable === 'true',
        pickupCity: data.pickupCity || null,
        pickupState: data.pickupState || null,
        pickupPostalCode: data.pickupPostalCode || null,
        // Category system fields
        categoryId: data.categoryId || null,
        subcategoryId: data.subcategoryId || null,
        productAttributes: parseJsonOrNull(data.productAttributes),
        // Reset to PENDING on edit so admin can re-review
        status: 'PENDING',
      },
    });

    const fraudQuery = shouldRecommendFraudReview(riskAssessment) ? '&fraud=review' : '';

    return NextResponse.redirect(new URL(`/seller?updated=${updated.id}${fraudQuery}`, req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/products/[id] POST]', err);
    return NextResponse.json({ error: 'Failed to update listing.' }, { status: 500 });
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

    // Block restricted sellers from editing or deleting listings
    const dbUser = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId: session.user.id },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return NextResponse.json(
        { error: 'Submit and pass seller verification before listing products.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const existing = await getSellerProduct(id, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const body: unknown = await req.json();
    const data = updateSchema.parse(body);

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

    const riskAssessment = await getListingRiskAssessmentForCandidate(
      buildListingRiskCandidate(session.user.id, existing, data, resolvedImages),
      id,
    );

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.price && { priceCents: cents(data.price) }),
        ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
        ...(data.category && { category: data.category }),
        ...(data.condition && { condition: data.condition }),
        imageUrl: mainImage,
        images: resolvedImages,
        mainImage,
        videoUrl,
        ...(data.inventory && { inventory: Number(data.inventory) }),
        ...(data.pickupAvailable !== undefined && { pickupAvailable: data.pickupAvailable === 'true' }),
        ...(data.pickupCity !== undefined && { pickupCity: data.pickupCity || null }),
        ...(data.pickupState !== undefined && { pickupState: data.pickupState || null }),
        ...(data.pickupPostalCode !== undefined && { pickupPostalCode: data.pickupPostalCode || null }),
        // Category system fields
        categoryId: data.categoryId || null,
        subcategoryId: data.subcategoryId || null,
        productAttributes: parseJsonOrNull(data.productAttributes),
        status: 'PENDING',
      },
    });

    return NextResponse.json({
      ...updated,
      fraudReviewRecommended: shouldRecommendFraudReview(riskAssessment),
    });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/products/[id] PATCH]', err);
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

    const { id } = await params;
    const existing = await getSellerProduct(id, session.user.id);
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
