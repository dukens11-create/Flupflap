/**
 * GET /api/admin/users
 *
 * Admin-only endpoint to list and search user accounts.
 * Query params:
 *   q     — search term (name or email, optional)
 *   role  — filter by role: CUSTOMER | SELLER | ADMIN (optional)
 *   page  — page number (default 1)
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const PAGE_SIZE = 30;

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') ?? '';
    const role = searchParams.get('role') ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

    const where: any = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (role && ['CUSTOMER', 'SELLER', 'ADMIN'].includes(role)) {
      where.role = role;
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          phoneVerified: true,
          sellerStatus: true,
          createdAt: true,
          _count: { select: { products: true, orders: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return NextResponse.json({ users, total, page, pageSize: PAGE_SIZE });
  } catch (err) {
    console.error('[admin/users GET]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
