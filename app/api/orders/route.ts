import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orders = await prisma.order.findMany({
    where: { buyerId: session.user.id },
    include: {
      items: { include: { product: { select: { title: true, imageUrl: true } } } },
      shipments: {
        select: {
          id: true,
          sellerId: true,
          seller: { select: { name: true, shopName: true } },
          shipmentStatus: true,
          trackingNumber: true,
          carrier: true,
          labelUrl: true,
          trackingUrl: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json(orders);
}
