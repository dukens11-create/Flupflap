import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { calculateGarageSaleDurationDays } from '@/lib/garage-sale-pricing';
import { expireGarageSales, resolveGarageSaleByRouteParam } from '@/lib/garage-sales';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import { logInfo, logWarn } from '@/lib/logger';
import { sessionHasRole } from '@/lib/user-roles';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  title: z.string().min(3).max(120).optional(),
  description: z.string().min(10).max(5000).optional(),
  saleType: z.enum(['GARAGE_SALE', 'YARD_SALE', 'ESTATE_SALE', 'MOVING_SALE']).optional(),
  listingType: z.enum(['STANDARD', 'FEATURED']).optional(),
  address: z.string().min(3).max(200).optional(),
  city: z.string().min(2).max(100).optional(),
  state: z.string().min(2).max(100).optional(),
  zipCode: z.string().min(3).max(20).optional(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  photos: z.array(z.string().url()).max(10).optional(),
  videoUrl: z.string().url().optional().nullable(),
  categories: z.array(z.string()).max(10).optional(),
  sellerPhone: z.string().max(30).optional().nullable(),
  priceRangeMin: z.number().min(0).optional().nullable(),
  priceRangeMax: z.number().min(0).optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

/** GET /api/garage-sales/[id] — get a single garage sale (public if approved) */
export async function GET(_req: Request, { params }: Params) {
  await expireGarageSales();
  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]');
  if (!resolvedSale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id: resolvedSale.id },
    include: {
      seller: {
        select: {
          id: true,
          name: true,
          shopName: true,
          profileImageUrl: true,
          phoneVerified: true,
          phone: true,
        },
      },
      _count: { select: { favorites: true } },
    },
  });

  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  const isOwner = session?.user?.id === sale.sellerId;
  const isAdmin = session?.user?.role === 'ADMIN';
  const lifecycle = deriveGarageSaleLifecycle(sale);

  if (!lifecycle.publiclyVisible && !isOwner && !isAdmin) {
    logWarn('Garage sale API fetch rejected for non-public listing', {
      tag: 'api/garage-sales/[id]',
      saleId: sale.id,
      routeParam: id,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
    });
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  logInfo('Garage sale API fetched', {
    tag: 'api/garage-sales/[id]',
    saleId: sale.id,
    routeParam: id,
    isOwner,
    lifecycle: lifecycle.state,
  });

  // Increment view count (fire-and-forget, log errors)
  if (lifecycle.publiclyVisible && !isOwner) {
    prisma.garageSale.update({
      where: { id: sale.id },
      data: { viewCount: { increment: 1 } },
    }).catch((err) => {
      console.error('[garage-sales/id GET] view count increment failed', err);
    });
  }

  return NextResponse.json(sale);
}

/** PATCH /api/garage-sales/[id] — edit a garage sale (owner only) */
export async function PATCH(req: Request, { params }: Params) {
  await expireGarageSales();
  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]#patch');
  if (!resolvedSale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sale = await prisma.garageSale.findUnique({ where: { id: resolvedSale.id } });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (sale.sellerId !== session.user.id && !sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const data = parsed.data;
  const updates: Record<string, unknown> = {};

  if (data.title !== undefined) updates.title = data.title;
  if (data.description !== undefined) updates.description = data.description;
  if (data.saleType !== undefined) updates.saleType = data.saleType;
  if (data.listingType !== undefined) {
    updates.listingType = data.listingType;
    updates.isFeatured = data.listingType === 'FEATURED';
  }
  if (data.address !== undefined) updates.address = data.address;
  if (data.city !== undefined) updates.city = data.city;
  if (data.state !== undefined) updates.state = data.state;
  if (data.zipCode !== undefined) updates.zipCode = data.zipCode;
  if (data.latitude !== undefined) updates.latitude = data.latitude;
  if (data.longitude !== undefined) updates.longitude = data.longitude;
  if (data.startDate !== undefined) updates.startDate = new Date(data.startDate);
  if (data.endDate !== undefined) {
    const parsedEnd = new Date(data.endDate);
    updates.endDate = parsedEnd;
    updates.expirationTimestamp = parsedEnd;
  }
  if (data.photos !== undefined) updates.photos = data.photos;
  if (data.videoUrl !== undefined) updates.videoUrl = data.videoUrl;
  if (data.categories !== undefined) updates.categories = data.categories;
  if (data.sellerPhone !== undefined) updates.sellerPhone = data.sellerPhone;
  if (data.priceRangeMin !== undefined) updates.priceRangeMin = data.priceRangeMin;
  if (data.priceRangeMax !== undefined) updates.priceRangeMax = data.priceRangeMax;

  const maybeStart = (updates.startDate as Date | undefined) ?? sale.startDate;
  const maybeEnd = (updates.endDate as Date | undefined) ?? sale.endDate;
  const durationDays = calculateGarageSaleDurationDays(maybeStart, maybeEnd);
  if (durationDays <= 0) {
    return NextResponse.json({ error: 'End date must be after start date' }, { status: 422 });
  }
  updates.durationDays = durationDays;

  // Re-pend if editing an approved listing
  if (sale.status === 'APPROVED' && !sessionHasRole(session.user, 'ADMIN')) {
    updates.status = 'PENDING';
  }

  const updated = await prisma.garageSale.update({ where: { id: sale.id }, data: updates });
  return NextResponse.json(updated);
}

/** DELETE /api/garage-sales/[id] — delete (owner or admin) */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  const resolvedSale = await resolveGarageSaleByRouteParam(id, 'api/garage-sales/[id]#delete');
  if (!resolvedSale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sale = await prisma.garageSale.findUnique({ where: { id: resolvedSale.id } });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (sale.sellerId !== session.user.id && !sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.garageSale.delete({ where: { id: sale.id } });
  return NextResponse.json({ success: true });
}
