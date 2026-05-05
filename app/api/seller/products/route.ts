import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  price: z.string(),
  shipping: z.string().optional(),
  category: z.string().min(1),
  condition: z.string().min(1),
  imageUrl: z.string().url(),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(), // 'true' when checkbox checked
  pickupCity: z.string().optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(10).optional(),
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

/** Geocode a postal code via the internal proxy (no external key needed). */
async function geocodePostalCode(postalCode: string, appUrl: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(`${appUrl}/api/geo/zip?zip=${encodeURIComponent(postalCode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.lat === 'number' && typeof data.lng === 'number') return data;
    return null;
  } catch {
    return null;
  }
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

    const form = await req.formData();
    const data = schema.parse(Object.fromEntries(form.entries()));

    const pickupAvailable = data.pickupAvailable === 'true';
    let pickupLat: number | null = null;
    let pickupLng: number | null = null;

    if (pickupAvailable && data.pickupPostalCode) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
      const geo = await geocodePostalCode(data.pickupPostalCode, appUrl);
      if (geo) {
        pickupLat = geo.lat;
        pickupLng = geo.lng;
      }
    }

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
        pickupAvailable,
        pickupCity: pickupAvailable ? (data.pickupCity ?? null) : null,
        pickupState: pickupAvailable ? (data.pickupState ?? null) : null,
        pickupPostalCode: pickupAvailable ? (data.pickupPostalCode ?? null) : null,
        pickupLat,
        pickupLng,
      },
    });

    return NextResponse.redirect(new URL(`/seller?created=${product.id}`, req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[seller/products POST]', err);
    return NextResponse.json({ error: 'Failed to create listing.' }, { status: 500 });
  }
}
