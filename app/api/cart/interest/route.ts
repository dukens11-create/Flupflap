import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const body = await req.json() as { productId?: unknown };
    const productId = typeof body.productId === 'string' ? body.productId.trim() : '';

    if (!productId) {
      return NextResponse.json({ error: 'productId is required.' }, { status: 400 });
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, status: true },
    });

    if (!product || product.status !== 'APPROVED') {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const now = new Date();
    await prisma.productCartInterest.upsert({
      where: { productId },
      update: {
        totalAdds: { increment: 1 },
        lastAddedAt: now,
      },
      create: {
        productId,
        totalAdds: 1,
        lastAddedAt: now,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[cart/interest POST]', err);
    return NextResponse.json({ error: 'Failed to track cart interest.' }, { status: 500 });
  }
}
