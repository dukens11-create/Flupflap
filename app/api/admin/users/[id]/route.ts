/**
 * GET /api/admin/users/[id]
 *
 * Admin-only endpoint to retrieve full account details for a specific user.
 * Returns profile, orders, listings (for sellers), and moderation history.
 * Does NOT return password hashes or raw authentication secrets.
 * Logs the admin access to AdminAccessLog for audit purposes.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sessionHasRole } from '@/lib/user-roles';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionHasRole(session.user, 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        phoneVerified: true,
        phoneVerifiedAt: true,
        profileImageUrl: true,
        sellerStatus: true,
        sellerStatusReason: true,
        sellerStatusNotes: true,
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        createdAt: true,
        // password deliberately excluded
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    const [orders, products, moderationLogs] = await Promise.all([
      prisma.order.findMany({
        where:
          user.role === 'SELLER'
            ? { items: { some: { product: { sellerId: id } } } }
            : { buyerId: id },
        orderBy: { createdAt: 'desc' },
        take: 30,
        include: {
          items: {
            include: { product: { select: { title: true } } },
          },
          buyer: { select: { name: true, email: true } },
        },
      }),
      user.role === 'SELLER'
        ? prisma.product.findMany({
            where: { sellerId: id },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true, title: true, status: true, priceCents: true, createdAt: true },
          })
        : Promise.resolve([]),
      user.role === 'SELLER'
        ? prisma.sellerModerationLog.findMany({
            where: { sellerId: id },
            orderBy: { createdAt: 'desc' },
            include: { admin: { select: { name: true, email: true } } },
          })
        : Promise.resolve([]),
    ]);

    // Log admin access for audit trail
    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: id,
        action: 'view_account',
      },
    });

    return NextResponse.json({ user, orders, products, moderationLogs });
  } catch (err) {
    console.error('[admin/users/[id] GET]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!sessionHasRole(session.user, 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, profileImageUrl: true, image: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    await prisma.user.update({
      where: { id },
      data: {
        profileImageUrl: null,
        image: null,
      },
    });

    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: id,
        action: 'remove_profile_image',
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[admin/users/[id] DELETE]', error);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
