import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { calculateGarageSalePricing, MILLISECONDS_PER_DAY } from '@/lib/garage-sale-pricing';
import { getGarageSalePricingSettings } from '@/lib/garage-sales';
import { logInfo } from '@/lib/logger';

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

  const settings = await getGarageSalePricingSettings();

  // Used only to compute durationDays; all pricing is free.
  const pricing = calculateGarageSalePricing({
    homepagePromotion: false,
    topLocalSearchPlacement: false,
    settings: { ...settings, garageSalesFree: true },
  });

  const repost = await prisma.garageSale.create({
    data: {
      sellerId: source.sellerId,
      repostOfId: source.id,
      title: source.title,
      description: source.description,
      saleType: source.saleType,
      listingType: 'STANDARD',
      status: 'APPROVED',
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
      isFeatured: false,
      homepagePromoted: false,
      topSearchPromoted: false,
      pricePerDayCents: 0,
      baseAmountCents: 0,
      addOnsAmountCents: 0,
      totalPaidCents: 0,
      paymentStatus: 'PAID',
      paidAt: now,
      activatedAt: now,
    },
  });

  logInfo('Garage sale repost created', {
    tag: 'garage-sales/repost',
    saleId: repost.id,
    sourceSaleId: source.id,
    sellerId: repost.sellerId,
    requiresPayment: false,
  });

  await prisma.garageSalePayment.create({
    data: {
      saleId: repost.id,
      sellerId: repost.sellerId,
      amountCents: 0,
      status: 'PAID',
    },
  });
  const encodedRepostId = encodeURIComponent(repost.id);
  logInfo('Garage sale repost activated without checkout', {
    tag: 'garage-sales/repost',
    saleId: repost.id,
    sourceSaleId: source.id,
    sellerId: repost.sellerId,
  });
  return NextResponse.redirect(new URL(`/garage-sales/${encodedRepostId}?reposted=1`, req.url), 303);
}
