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
import { logError } from '@/lib/logger';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
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
  } catch (err) {
    logError('Failed to load admin reports queue', err, { tag: 'admin/reports/GET' });
    return NextResponse.json({ error: 'Unable to load reports right now.' }, { status: 500 });
  }
}
