import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { ReportStatus } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') ?? ReportStatus.OPEN;
  const validStatuses = [ReportStatus.OPEN, ReportStatus.DISMISSED, ReportStatus.RESOLVED];
  const status = validStatuses.includes(statusParam as ReportStatus)
    ? (statusParam as ReportStatus)
    : ReportStatus.OPEN;

  const complaints = await prisma.buyerComplaint.findMany({
    where: { status },
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
