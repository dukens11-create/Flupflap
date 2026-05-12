import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { cents } from '@/lib/money';
import { logError } from '@/lib/logger';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  price: z.coerce.number().finite().nonnegative(),
  condition: z.string(),
  category: z.string(),
  imageUrl: z.string().url(),
  sellerEmail: z.string().email(),
  shipping: z.preprocess(
    (value) => (value === '' || value == null ? undefined : Number(value)),
    z.number().finite().nonnegative().optional(),
  ),
  inventory: z.preprocess(
    (value) => (value === '' || value == null ? undefined : Number(value)),
    z.number().int().min(1).optional(),
  ),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const products = await prisma.product.findMany({
      where: { status: 'PENDING' },
      include: { seller: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json(products);
  } catch (err) {
    logError('Failed to list pending admin products', err, { tag: 'admin/products/GET' });
    return NextResponse.json({ error: 'Unable to load products right now.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const form = await req.formData();
    const parsed = schema.safeParse(Object.fromEntries(form.entries()));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input.', details: parsed.error.issues }, { status: 400 });
    }

    const data = parsed.data;
    const priceCents = cents(data.price);
    const shippingCents = cents(data.shipping ?? 0);
    const inventory = data.inventory ?? 1;
    if (
      !Number.isFinite(priceCents) ||
      !Number.isFinite(shippingCents) ||
      !Number.isInteger(inventory) ||
      inventory < 1
    ) {
      return NextResponse.json({ error: 'Invalid numeric values.' }, { status: 400 });
    }

    const seller = await prisma.user.findUnique({ where: { email: data.sellerEmail.toLowerCase() } });
    if (!seller) {
      return NextResponse.json(
        { error: 'Seller account not found. Ask the seller to sign up before adding products.' },
        { status: 400 },
      );
    }
    const product = await prisma.product.create({
      data: {
        title: data.title,
        description: data.description,
        priceCents,
        condition: data.condition,
        category: data.category,
        imageUrl: data.imageUrl,
        sellerId: seller.id,
        shippingCents,
        inventory,
      },
    });
    return NextResponse.redirect(new URL(`/seller?created=${product.id}`, req.url));
  } catch (err) {
    logError('Failed to create admin product listing', err, { tag: 'admin/products/POST' });
    return NextResponse.json({ error: 'Unable to create product right now.' }, { status: 500 });
  }
}
