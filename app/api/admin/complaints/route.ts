import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') ?? 'OPEN';
  const validStatuses = ['OPEN', 'DISMISSED', 'RESOLVED'];
  const status = validStatuses.includes(statusParam) ? statusParam : 'OPEN';

  const complaints = await prisma.buyerComplaint.findMany({
    where: { status: status as any },
    orderBy: { createdAt: 'asc' },
    include: {
      buyer: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true, sellerStatus: true } },
      order: { select: { id: true, status: true, createdAt: true } },
      admin: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json(complaints);
}
