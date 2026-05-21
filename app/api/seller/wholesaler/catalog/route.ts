import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { supplierCanBeListedWhere } from '@/lib/wholesaler';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const products = await prisma.supplierProduct.findMany({
    where: supplierCanBeListedWhere(),
    orderBy: { updatedAt: 'desc' },
    include: {
      supplier: {
        select: {
          id: true,
          displayName: true,
          status: true,
          userId: true,
        },
      },
    },
    take: 200,
  });

  return NextResponse.json({ products });
}
