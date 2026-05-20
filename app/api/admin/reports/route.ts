/**
 * GET /api/admin/reports
 *
 * Returns product reports for the admin moderation queue.
 * Supports ?status=OPEN|DISMISSED|RESOLVED filter (default: OPEN).
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sessionHasRole } from '@/lib/user-roles';

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get('status') ?? 'OPEN';
  const validStatuses = ['OPEN', 'DISMISSED', 'RESOLVED'];
  const status = validStatuses.includes(statusParam) ? statusParam : 'OPEN';

  const reports = await prisma.productReport.findMany({
    where: { status: status as any },
    orderBy: { createdAt: 'asc' },
    include: {
      product: { select: { id: true, title: true, status: true, imageUrl: true } },
      reporter: { select: { id: true, name: true, email: true } },
      seller: { select: { id: true, name: true, email: true, sellerStatus: true } },
      admin: { select: { name: true, email: true } },
    },
  });

  return NextResponse.json(reports);
}
