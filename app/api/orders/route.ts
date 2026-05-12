import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { logError } from '@/lib/logger';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const orders = await prisma.order.findMany({
      where: { buyerId: session.user.id },
      include: { items: { include: { product: { select: { title: true, imageUrl: true } } } } },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(orders);
  } catch (err) {
    logError('Failed to load buyer orders', err, { tag: 'orders/GET' });
    return NextResponse.json({ error: 'Unable to load orders right now.' }, { status: 500 });
  }
}
