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

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  price: z.string().optional(),
  shipping: z.string().optional(),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  images: z.union([z.string().url(), z.array(z.string().url())]).optional(),
  videoUrl: z.string().optional(),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().max(100).optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(20).optional(),
});

type ProductUpdateInput = z.infer<typeof updateSchema>;

async function getSellerProduct(id: string, sellerId: string) {
  return prisma.product.findFirst({ where: { id, sellerId } });
}

function buildListingRiskCandidate(
  sellerId: string,
  existing: NonNullable<Awaited<ReturnType<typeof getSellerProduct>>>,
  data: ProductUpdateInput,
  resolvedImages: string[],
) {
  const mainImage = resolvedImages[0] ?? data.imageUrl ?? existing.imageUrl;
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

    // Resolve images: prefer multi-images, fall back to legacy imageUrl or existing images
    const resolvedImages: string[] = imagesRaw.length
      ? imagesRaw
      : data.imageUrl
        ? [data.imageUrl]
        : existing.images?.length
          ? existing.images
          : existing.imageUrl
            ? [existing.imageUrl]
            : [];
    const mainImage = resolvedImages[0] ?? existing.imageUrl;
    const videoUrl = data.videoUrl !== undefined
      ? (data.videoUrl && data.videoUrl.startsWith('http') ? data.videoUrl : null)
      : existing.videoUrl;

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

    // Resolve images for PATCH (JSON body)
    const imagesInput = Array.isArray(data.images)
      ? data.images
      : data.images
        ? [data.images]
        : data.imageUrl
          ? [data.imageUrl]
          : null;
    const resolvedImages = imagesInput ?? existing.images ?? (existing.imageUrl ? [existing.imageUrl] : []);
    const mainImage = resolvedImages[0] ?? existing.imageUrl;
    const videoUrl = data.videoUrl !== undefined
      ? (data.videoUrl && data.videoUrl.startsWith('http') ? data.videoUrl : null)
      : existing.videoUrl;

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
        ...(imagesInput && { imageUrl: mainImage, images: resolvedImages, mainImage }),
        ...(videoUrl !== undefined && { videoUrl }),
        ...(data.inventory && { inventory: Number(data.inventory) }),
        ...(data.pickupAvailable !== undefined && { pickupAvailable: data.pickupAvailable === 'true' }),
        ...(data.pickupCity !== undefined && { pickupCity: data.pickupCity || null }),
        ...(data.pickupState !== undefined && { pickupState: data.pickupState || null }),
        ...(data.pickupPostalCode !== undefined && { pickupPostalCode: data.pickupPostalCode || null }),
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
