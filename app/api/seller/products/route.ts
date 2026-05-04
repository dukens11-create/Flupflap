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

    const form = await req.formData();
    const data = schema.parse(Object.fromEntries(form.entries()));

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
