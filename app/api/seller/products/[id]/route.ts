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
});

async function getSellerProduct(id: string, sellerId: string) {
  return prisma.product.findFirst({ where: { id, sellerId } });
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

    const { id } = await params;
    const existing = await getSellerProduct(id, session.user.id);
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const body = await req.json() as Record<string, string>;
    const data = updateSchema.parse(body);

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
