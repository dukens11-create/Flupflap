import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id,
      // Buyers see their own orders; admins see all
      ...(session.user.role !== 'ADMIN' && { buyerId: session.user.id }),
    },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              id: true,
              title: true,
              imageUrl: true,
              seller: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  return NextResponse.json(order);
}
