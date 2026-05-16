import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { appUrl, stripe } from '@/lib/stripe';
import { calculateGarageSalePricing, MILLISECONDS_PER_DAY } from '@/lib/garage-sale-pricing';
import { getGarageSalePricingSettings } from '@/lib/garage-sales';

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const loginUrl = new URL('/login', req.url);
    return NextResponse.redirect(loginUrl, 303);
  }

  const { id } = await params;
  const source = await prisma.garageSale.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json({ error: 'Listing not found' }, { status: 404 });
  }

  const isOwner = source.sellerId === session.user.id;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const durationDays = source.durationDays > 0
    ? source.durationDays
    : Math.max(1, Math.ceil((source.endDate.getTime() - source.startDate.getTime()) / MILLISECONDS_PER_DAY));
  const startDate = now;
  const endDate = new Date(now.getTime() + durationDays * MILLISECONDS_PER_DAY);

  const [settings, paidGarageSaleCount] = await Promise.all([
    getGarageSalePricingSettings(),
    prisma.garageSale.count({ where: { sellerId: source.sellerId, paymentStatus: 'PAID' } }),
  ]);

  const pricing = calculateGarageSalePricing({
    listingType: source.listingType,
    startDate,
    endDate,
    homepagePromotion: source.homepagePromoted,
    topLocalSearchPlacement: source.topSearchPromoted,
    settings,
    isEligibleForFreeFirstListing: paidGarageSaleCount === 0,
  });

  const repost = await prisma.garageSale.create({
    data: {
      sellerId: source.sellerId,
      repostOfId: source.id,
      title: source.title,
      description: source.description,
      saleType: source.saleType,
      listingType: source.listingType,
      status: pricing.totalCents === 0 ? 'APPROVED' : 'HIDDEN',
      address: source.address,
      city: source.city,
      state: source.state,
      zipCode: source.zipCode,
      latitude: source.latitude,
      longitude: source.longitude,
      startDate,
      endDate,
      expirationTimestamp: endDate,
      durationDays: pricing.durationDays,
      photos: source.photos,
      videoUrl: source.videoUrl,
      categories: source.categories,
      sellerPhone: source.sellerPhone,
      priceRangeMin: source.priceRangeMin,
      priceRangeMax: source.priceRangeMax,
      isFeatured: source.listingType === 'FEATURED',
      homepagePromoted: pricing.effectiveHomepagePromotion,
      topSearchPromoted: pricing.effectiveTopLocalSearchPlacement,
      pricePerDayCents: pricing.pricePerDayCents,
      baseAmountCents: pricing.baseAmountCents,
      addOnsAmountCents: pricing.addOnsAmountCents,
      totalPaidCents: pricing.totalCents,
      paymentStatus: pricing.totalCents === 0 ? 'PAID' : 'PENDING',
      paidAt: pricing.totalCents === 0 ? now : null,
      activatedAt: pricing.totalCents === 0 ? now : null,
    },
  });

  if (pricing.totalCents === 0) {
    await prisma.garageSalePayment.create({
      data: {
        saleId: repost.id,
        sellerId: repost.sellerId,
        amountCents: 0,
        status: 'PAID',
      },
    });
    return NextResponse.redirect(new URL(`/garage-sales/${repost.id}?reposted=1&paid=1`, req.url), 303);
  }

  const lineItems: Array<{ quantity: number; price_data: { currency: string; product_data: { name: string; description?: string }; unit_amount: number } }> = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: {
          name: `${repost.listingType === 'FEATURED' ? 'Featured' : 'Standard'} Garage Sale Repost`,
          description: `${pricing.durationDays} day${pricing.durationDays === 1 ? '' : 's'} at $${(pricing.pricePerDayCents / 100).toFixed(2)}/day`,
        },
        unit_amount: pricing.baseAmountCents,
      },
    },
  ];

  if (pricing.homepagePromotionCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: { name: 'Garage Sale Homepage Promotion' },
        unit_amount: pricing.homepagePromotionCents,
      },
    });
  }
  if (pricing.topLocalSearchPlacementCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: { name: 'Garage Sale Top Local Search Placement' },
        unit_amount: pricing.topLocalSearchPlacementCents,
      },
    });
  }

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    success_url: `${appUrl}/garage-sales/${repost.id}?paid=1&reposted=1`,
    cancel_url: `${appUrl}/garage-sales/${source.id}?payment=cancelled`,
    customer_email: session.user.email ?? undefined,
    metadata: {
      type: 'garage_sale_listing',
      saleId: repost.id,
      sellerId: repost.sellerId,
      listingType: repost.listingType,
      durationDays: String(pricing.durationDays),
      repostOfId: source.id,
    },
  });

  await prisma.$transaction([
    prisma.garageSale.update({ where: { id: repost.id }, data: { stripeCheckoutId: checkout.id } }),
    prisma.garageSalePayment.create({
      data: {
        saleId: repost.id,
        sellerId: repost.sellerId,
        amountCents: pricing.totalCents,
        status: 'PENDING',
        stripeCheckoutId: checkout.id,
      },
    }),
  ]);

  if (checkout.url) {
    return NextResponse.redirect(checkout.url, 303);
  }

  return NextResponse.redirect(new URL(`/garage-sales/${repost.id}?reposted=1`, req.url), 303);
}
