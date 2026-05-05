/**
 * GET /api/admin/users/[id]
 *
 * Returns account details for a buyer or seller for admin support use.
 * Logs every access to AdminAccessLog for audit trail.
 *
 * Query params:
 *   reason — optional reason for accessing the account
 *
 * Restricted to ADMIN role only.
 * Does NOT expose passwords, raw tokens, or sensitive financial secrets.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const reason = searchParams.get('reason') ?? undefined;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        createdAt: true,
        sellerStatus: true,
        sellerStatusReason: true,
        sellerStatusNotes: true,
        stripeOnboardingComplete: true,
        // Never expose password or raw tokens
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            status: true,
            totalCents: true,
            isPickup: true,
            createdAt: true,
            items: {
              select: {
                id: true,
                priceCents: true,
                quantity: true,
                product: { select: { id: true, title: true } },
              },
            },
            pickupConfirmation: {
              select: { code: true, confirmedAt: true },
            },
          },
        },
        products: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            title: true,
            status: true,
            priceCents: true,
            createdAt: true,
            pickupAvailable: true,
          },
        },
        moderationLogsAsSeller: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            action: true,
            reasonCategory: true,
            notes: true,
            createdAt: true,
            admin: { select: { name: true, email: true } },
          },
        },
        adminAccessLogsAsTarget: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            reason: true,
            createdAt: true,
            admin: { select: { name: true, email: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    // Log this admin access
    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetUserId: id,
        reason: reason ?? null,
      },
    });

    return NextResponse.json(user);
  } catch (err: any) {
    console.error('[admin/users/[id] GET]', err);
    return NextResponse.json({ error: 'Failed to load user.' }, { status: 500 });
  }
}
