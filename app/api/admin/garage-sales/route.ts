import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/** GET /api/admin/garage-sales — admin list of all garage sales */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get('perPage') ?? '50', 10)));
  const skip = (page - 1) * perPage;

  const where: Record<string, unknown> = {};
  if (status && ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'HIDDEN'].includes(status)) {
    where.status = status;
  }

  const [sales, total] = await Promise.all([
    prisma.garageSale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { reports: true, favorites: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: perPage,
    }),
    prisma.garageSale.count({ where }),
  ]);

  return NextResponse.json({ sales, total, page, perPage });
}
