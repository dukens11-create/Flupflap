import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { z } from 'zod';

const updateSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().min(10).optional(),
  price: z.string().optional(),
  shipping: z.string().optional(),
  category: z.string().min(1).optional(),
  condition: z.string().min(1).optional(),
  imageUrl: z.string().url().optional(),
  inventory: z.string().optional(),
  pickupAvailable: z.string().optional(),
  pickupCity: z.string().optional(),
  pickupState: z.string().max(2).optional(),
  pickupPostalCode: z.string().max(10).optional(),
});

async function getSellerProduct(id: string, sellerId: string) {
  return prisma.product.findFirst({ where: { id, sellerId } });
}

/** Geocode a postal code via the internal proxy. */
async function geocodePostalCode(postalCode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const base = process.env.NEXTAUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${process.env.PORT ?? 3000}`;
    const res = await fetch(`${base}/api/geo/zip?zip=${encodeURIComponent(postalCode)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.lat === 'number' && typeof data.lng === 'number') return data;
    return null;
  } catch {
    return null;
  }
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
    const raw = Object.fromEntries(form.entries());
    const data = updateSchema.parse(raw);

    const pickupAvailable = data.pickupAvailable === 'true';
    let pickupLat: number | null | undefined = undefined;
    let pickupLng: number | null | undefined = undefined;

    if (data.pickupPostalCode !== undefined) {
      if (pickupAvailable && data.pickupPostalCode) {
        const geo = await geocodePostalCode(data.pickupPostalCode);
        pickupLat = geo?.lat ?? null;
        pickupLng = geo?.lng ?? null;
      } else if (!pickupAvailable) {
        pickupLat = null;
        pickupLng = null;
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.price && { priceCents: cents(data.price) }),
        ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
        ...(data.category && { category: data.category }),
        ...(data.condition && { condition: data.condition }),
        ...(data.imageUrl && { imageUrl: data.imageUrl }),
        ...(data.inventory && { inventory: Number(data.inventory) }),
        ...(data.pickupAvailable !== undefined && { pickupAvailable }),
        ...(data.pickupCity !== undefined && { pickupCity: pickupAvailable ? (data.pickupCity || null) : null }),
        ...(data.pickupState !== undefined && { pickupState: pickupAvailable ? (data.pickupState || null) : null }),
        ...(data.pickupPostalCode !== undefined && { pickupPostalCode: pickupAvailable ? (data.pickupPostalCode || null) : null }),
        ...(pickupLat !== undefined && { pickupLat }),
        ...(pickupLng !== undefined && { pickupLng }),
        // Reset to PENDING on edit so admin can re-review
        status: 'PENDING',
      },
    });

    return NextResponse.redirect(new URL(`/seller?updated=${updated.id}`, req.url));
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

    const { id } = await params;
    const existing = await getSellerProduct(id, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const body: unknown = await req.json();
    const data = updateSchema.parse(body);

    const pickupAvailable = data.pickupAvailable === 'true';

    let pickupLat: number | null | undefined = undefined;
    let pickupLng: number | null | undefined = undefined;

    if (data.pickupPostalCode !== undefined) {
      if (pickupAvailable && data.pickupPostalCode) {
        const geo = await geocodePostalCode(data.pickupPostalCode);
        pickupLat = geo?.lat ?? null;
        pickupLng = geo?.lng ?? null;
      } else if (!pickupAvailable) {
        pickupLat = null;
        pickupLng = null;
      }
    }

    const updated = await prisma.product.update({
      where: { id },
      data: {
        ...(data.title && { title: data.title }),
        ...(data.description && { description: data.description }),
        ...(data.price && { priceCents: cents(data.price) }),
        ...(data.shipping !== undefined && { shippingCents: cents(data.shipping || '0') }),
        ...(data.category && { category: data.category }),
        ...(data.condition && { condition: data.condition }),
        ...(data.imageUrl && { imageUrl: data.imageUrl }),
        ...(data.inventory && { inventory: Number(data.inventory) }),
        ...(data.pickupAvailable !== undefined && { pickupAvailable }),
        ...(data.pickupCity !== undefined && { pickupCity: pickupAvailable ? (data.pickupCity || null) : null }),
        ...(data.pickupState !== undefined && { pickupState: pickupAvailable ? (data.pickupState || null) : null }),
        ...(data.pickupPostalCode !== undefined && { pickupPostalCode: pickupAvailable ? (data.pickupPostalCode || null) : null }),
        ...(pickupLat !== undefined && { pickupLat }),
        ...(pickupLng !== undefined && { pickupLng }),
        status: 'PENDING',
      },
    });

    return NextResponse.json(updated);
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
