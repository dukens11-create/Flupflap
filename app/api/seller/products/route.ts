import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';
import { isSubscriptionActive } from '@/lib/subscription';
import { syncSellerSubscriptionFromStripe } from '@/lib/subscription-sync';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { getListingRiskAssessmentForCandidate } from '@/lib/fraud-detection';

const schema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  price: z.string(),
  shipping: z.string().optional(),
  category: z.string().min(1),
  condition: z.string().min(1),
  imageUrl: z.string().url(),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(), // "true" when checkbox is checked
  pickupCity: z.string().max(100).optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(20).optional(),
});

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
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Block restricted sellers from creating new listings
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

    // Require an active subscription to list items
    if (!dbUser) {
      return NextResponse.json({ error: 'An active seller subscription is required to list items.' }, { status: 403 });
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
      return NextResponse.json({ error: 'An active seller subscription is required to list items.' }, { status: 403 });
    }

    const form = await req.formData();
    const data = schema.parse(Object.fromEntries(form.entries()));
    const riskAssessment = await getListingRiskAssessmentForCandidate({
      sellerId: session.user.id,
      title: data.title,
      description: data.description,
      priceCents: cents(data.price),
      category: data.category,
      condition: data.condition,
      imageUrl: data.imageUrl,
    });

    const product = await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        priceCents: cents(data.price),
        condition: data.condition,
        category: data.category,
        imageUrl: data.imageUrl,
        sellerId: session.user.id,
        shippingCents: cents(data.shipping || '0'),
        inventory: Number(data.inventory || 1),
        status: 'PENDING',
        pickupAvailable: data.pickupAvailable === 'true',
        pickupCity: data.pickupCity || null,
        pickupState: data.pickupState || null,
        pickupPostalCode: data.pickupPostalCode || null,
      },
    });

    const fraudQuery =
      riskAssessment.level === 'HIGH' || riskAssessment.level === 'MEDIUM'
        ? '&fraud=review'
        : '';

    return NextResponse.redirect(new URL(`/seller?created=${product.id}${fraudQuery}`, req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/products POST]', err);
    return NextResponse.json({ error: 'Failed to create listing.' }, { status: 500 });
  }
}
