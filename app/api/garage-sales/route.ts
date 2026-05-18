import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { appUrl, stripe } from '@/lib/stripe';
import { calculateGarageSalePricing } from '@/lib/garage-sale-pricing';
import { buildPublicGarageSaleWhere, expireGarageSales, getGarageSalePricingSettings } from '@/lib/garage-sales';
import { logInfo } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const GARAGE_SALE_CATEGORIES = [
  'furniture', 'electronics', 'clothing', 'tools', 'toys',
  'baby_items', 'appliances', 'collectibles', 'automotive', 'miscellaneous',
];

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().min(10).max(5000),
  saleType: z.enum(['GARAGE_SALE', 'YARD_SALE', 'ESTATE_SALE', 'MOVING_SALE']),
  listingType: z.enum(['STANDARD', 'FEATURED']).default('STANDARD'),
  address: z.string().min(3).max(200),
  city: z.string().min(2).max(100),
  state: z.string().min(2).max(100),
  zipCode: z.string().min(3).max(20),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  photos: z.array(z.string().url()).max(10).default([]),
  videoUrl: z.string().url().optional().nullable(),
  categories: z.array(z.string()).max(10).default([]),
  sellerPhone: z.string().max(30).optional().nullable(),
  priceRangeMin: z.number().min(0).optional().nullable(),
  priceRangeMax: z.number().min(0).optional().nullable(),
  homepagePromotion: z.boolean().default(false),
  topLocalSearchPlacement: z.boolean().default(false),
});

/** GET /api/garage-sales — public listing with search & filters */
export async function GET(req: Request) {
  await expireGarageSales();

  const url = new URL(req.url);
  const q = url.searchParams.get('q')?.trim() ?? '';
  const city = url.searchParams.get('city')?.trim() ?? '';
  const zipCode = url.searchParams.get('zip')?.trim() ?? '';
  const state = url.searchParams.get('state')?.trim() ?? '';
  const saleType = url.searchParams.get('saleType') ?? '';
  const category = url.searchParams.get('category') ?? '';
  const dateFilter = url.searchParams.get('date') ?? ''; // today|tomorrow|weekend|open_now|starting_soon
  const sort = url.searchParams.get('sort') ?? 'newest'; // newest|closest|most_viewed|featured
  const lat = parseFloat(url.searchParams.get('lat') ?? '');
  const lng = parseFloat(url.searchParams.get('lng') ?? '');
  const radius = parseFloat(url.searchParams.get('radius') ?? '50'); // miles
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(48, Math.max(1, parseInt(url.searchParams.get('perPage') ?? '24', 10)));
  const skip = (page - 1) * perPage;

  const now = new Date();

  // Date range filters
  let startAfter: Date | undefined;
  let startBefore: Date | undefined;
  let endAfter: Date | undefined;

  if (dateFilter === 'today') {
    startAfter = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startBefore = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    endAfter = now;
  } else if (dateFilter === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    startAfter = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    startBefore = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);
  } else if (dateFilter === 'weekend') {
    const day = now.getDay();
    const daysUntilSat = day === 6 ? 0 : 6 - day;
    const sat = new Date(now);
    sat.setDate(now.getDate() + daysUntilSat);
    sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat);
    sun.setDate(sat.getDate() + 1);
    sun.setHours(23, 59, 59, 999);
    startAfter = sat;
    startBefore = sun;
    endAfter = now;
  } else if (dateFilter === 'open_now') {
    startAfter = undefined;
    startBefore = now;
    endAfter = now;
  } else if (dateFilter === 'starting_soon') {
    startAfter = now;
    const soon = new Date(now);
    soon.setHours(now.getHours() + 24);
    startBefore = soon;
  }

  const where: Record<string, unknown> = buildPublicGarageSaleWhere(now);

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { city: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (city) where.city = { contains: city, mode: 'insensitive' };
  if (zipCode) where.zipCode = { contains: zipCode, mode: 'insensitive' };
  if (state) where.state = { contains: state, mode: 'insensitive' };
  if (saleType && ['GARAGE_SALE', 'YARD_SALE', 'ESTATE_SALE', 'MOVING_SALE'].includes(saleType)) {
    where.saleType = saleType;
  }
  if (category && GARAGE_SALE_CATEGORIES.includes(category)) {
    where.categories = { has: category };
  }
  if (startAfter || startBefore) {
    const startDateFilter: { gte?: Date; lte?: Date } = {};
    if (startAfter) startDateFilter.gte = startAfter;
    if (startBefore) startDateFilter.lte = startBefore;
    where.startDate = startDateFilter;
  }
  where.endDate = { gte: endAfter != null && endAfter > now ? endAfter : now };

  let orderBy: Record<string, string> | Record<string, string>[];
  if (sort === 'most_viewed') {
    orderBy = [{ isFeatured: 'desc' }, { viewCount: 'desc' }];
  } else if (sort === 'featured') {
    orderBy = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  } else if (sort === 'start_date') {
    orderBy = [{ isFeatured: 'desc' }, { startDate: 'asc' }];
  } else {
    orderBy = [{ isFeatured: 'desc' }, { createdAt: 'desc' }];
  }

  let sales = await prisma.garageSale.findMany({
    where,
    include: {
      seller: {
        select: { id: true, name: true, shopName: true, profileImageUrl: true, phoneVerified: true },
      },
      _count: { select: { favorites: true } },
    },
    orderBy,
    skip,
    take: perPage,
  });

  if (!isNaN(lat) && !isNaN(lng) && radius < 250) {
    sales = sales.filter((s) => {
      if (s.latitude == null || s.longitude == null) return false;
      const dist = haversineDistanceMiles(lat, lng, s.latitude, s.longitude);
      return dist <= radius;
    });
    if (sort === 'closest') {
      sales.sort((a, b) => {
        const da = haversineDistanceMiles(lat, lng, a.latitude!, a.longitude!);
        const db = haversineDistanceMiles(lat, lng, b.latitude!, b.longitude!);
        return da - db;
      });
    }
  }

  const total = await prisma.garageSale.count({ where });

  return NextResponse.json({ sales, total, page, perPage });
}

/** POST /api/garage-sales — create a garage sale listing and payment checkout */
export async function POST(req: Request) {
  await expireGarageSales();

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const data = parsed.data;
  const start = new Date(data.startDate);
  const end = new Date(data.endDate);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 422 });
  }

  const activeCount = await prisma.garageSale.count({
    where: {
      sellerId: session.user.id,
      paymentStatus: { in: ['PENDING', 'PAID'] },
      status: { in: ['PENDING', 'APPROVED', 'HIDDEN'] },
      endDate: { gte: new Date() },
    },
  });
  if (activeCount >= 5) {
    return NextResponse.json({ error: 'Maximum 5 active garage sale listings allowed' }, { status: 429 });
  }

  const pricingSettings = await getGarageSalePricingSettings();

  const pricing = calculateGarageSalePricing({
    listingType: 'STANDARD',
    startDate: start,
    endDate: end,
    homepagePromotion: false,
    topLocalSearchPlacement: false,
    settings: pricingSettings,
  });

  if (pricing.durationDays <= 0) {
    return NextResponse.json({ error: 'Invalid garage sale duration' }, { status: 422 });
  }

  const now = new Date();
  const sale = await prisma.garageSale.create({
    data: {
      sellerId: session.user.id,
      title: data.title,
      description: data.description,
      saleType: data.saleType,
      listingType: 'STANDARD',
      address: data.address,
      city: data.city,
      state: data.state,
      zipCode: data.zipCode,
      latitude: data.latitude ?? null,
      longitude: data.longitude ?? null,
      startDate: start,
      endDate: end,
      expirationTimestamp: end,
      durationDays: pricing.durationDays,
      photos: data.photos,
      videoUrl: data.videoUrl ?? null,
      categories: data.categories,
      sellerPhone: data.sellerPhone ?? null,
      priceRangeMin: data.priceRangeMin ?? null,
      priceRangeMax: data.priceRangeMax ?? null,
      isFeatured: false,
      homepagePromoted: false,
      topSearchPromoted: false,
      pricePerDayCents: pricing.pricePerDayCents,
      baseAmountCents: pricing.baseAmountCents,
      addOnsAmountCents: pricing.addOnsAmountCents,
      totalPaidCents: pricing.totalCents,
      paymentStatus: pricing.totalCents === 0 ? 'PAID' : 'PENDING',
      paidAt: pricing.totalCents === 0 ? now : null,
      activatedAt: pricing.totalCents === 0 ? now : null,
      status: pricing.totalCents === 0 ? 'APPROVED' : 'HIDDEN',
    },
  });

  logInfo('Garage sale listing created', {
    tag: 'garage-sales/POST',
    saleId: sale.id,
    sellerId: session.user.id,
    requiresPayment: pricing.totalCents > 0,
    initialStatus: sale.status,
    paymentStatus: sale.paymentStatus,
  });

  if (pricing.totalCents === 0) {
    await prisma.garageSalePayment.create({
      data: {
        saleId: sale.id,
        sellerId: session.user.id,
        amountCents: 0,
        status: 'PAID',
      },
    });
    logInfo('Garage sale listing activated without checkout', {
      tag: 'garage-sales/POST',
      saleId: sale.id,
      sellerId: session.user.id,
    });
    return NextResponse.json({ id: sale.id, checkoutUrl: null, requiresPayment: false }, { status: 201 });
  }

  const lineItems: Array<{ quantity: number; price_data: { currency: string; product_data: { name: string; description?: string }; unit_amount: number } }> = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        product_data: {
          name: 'Garage Sale Listing',
          description: `${pricing.durationDays} day${pricing.durationDays === 1 ? '' : 's'} at $${(pricing.pricePerDayCents / 100).toFixed(2)}/day`,
        },
        unit_amount: pricing.baseAmountCents,
      },
    },
  ];

  const checkout = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: lineItems,
    success_url: `${appUrl}/garage-sales/${sale.id}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/garage-sales/manage/${sale.id}?payment=cancelled`,
    customer_email: session.user.email ?? undefined,
    metadata: {
      type: 'garage_sale_listing',
      saleId: sale.id,
      sellerId: session.user.id,
      listingType: 'STANDARD',
      durationDays: String(pricing.durationDays),
    },
    payment_intent_data: {
      metadata: {
        type: 'garage_sale_listing',
        saleId: sale.id,
        sellerId: session.user.id,
      },
    },
  });

  await prisma.$transaction([
    prisma.garageSale.update({
      where: { id: sale.id },
      data: { stripeCheckoutId: checkout.id },
    }),
    prisma.garageSalePayment.create({
      data: {
        saleId: sale.id,
        sellerId: session.user.id,
        amountCents: pricing.totalCents,
        status: 'PENDING',
        stripeCheckoutId: checkout.id,
      },
    }),
  ]);

  logInfo('Garage sale checkout session created', {
    tag: 'garage-sales/POST',
    saleId: sale.id,
    sellerId: session.user.id,
    stripeCheckoutId: checkout.id,
  });

  return NextResponse.json({ id: sale.id, checkoutUrl: checkout.url, requiresPayment: true }, { status: 201 });
}

function haversineDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number) {
  return (deg * Math.PI) / 180;
}
