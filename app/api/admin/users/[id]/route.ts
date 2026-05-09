/**
 * /api/admin/users/[id]
 *
 * GET  - Admin-only endpoint to retrieve full account details for a specific user.
 * POST - Admin-only endpoint to update a user's contact details (email/phone).
 *
 * GET returns profile, orders, listings (for sellers), and moderation history.
 * Both handlers avoid exposing password hashes or raw authentication secrets and
 * log admin actions to AdminAccessLog for audit purposes.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

const contactSchema = z.object({
  email: z.string().trim().email('Invalid email format.'),
  phone: z.string().optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let targetId = '';
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    targetId = id;
    const form = await req.formData();
    const parsed = contactSchema.safeParse({
      email: form.get('email'),
      phone: form.get('phone')?.toString(),
    });
    if (!parsed.success) {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${id}?contactError=${encodeURIComponent(
            parsed.error.issues[0]?.message ?? 'Invalid input.',
          )}`,
          req.url,
        ),
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, phone: true },
    });
    if (!existingUser || (existingUser.role !== 'SELLER' && existingUser.role !== 'CUSTOMER')) {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${id}?contactError=${encodeURIComponent('User not found.')}`,
          req.url,
        ),
      );
    }

    const email = parsed.data.email.trim().toLowerCase();
    const phoneInput = parsed.data.phone?.trim() ?? '';
    const phone = phoneInput === '' ? null : normalizePhone(phoneInput);
    if (phoneInput && !phone) {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${id}?contactError=${encodeURIComponent('Invalid phone format.')}`,
          req.url,
        ),
      );
    }

    const emailOwner = await prisma.user.findFirst({
      where: { email, id: { not: id } },
      select: { id: true },
    });
    if (emailOwner) {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${id}?contactError=${encodeURIComponent('Email is already in use by another account.')}`,
          req.url,
        ),
      );
    }

    const phoneChanged = existingUser.phone !== phone;
    await prisma.user.update({
      where: { id },
      data: {
        email,
        phone,
        phoneVerified: phoneChanged ? false : undefined,
        phoneVerifiedAt: phoneChanged ? null : undefined,
      },
    });

    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: id,
        action: 'update_contact',
        notes: `Updated contact details by ${session.user.email ?? session.user.id}`,
      },
    });

    return NextResponse.redirect(new URL(`/admin/users/${id}?contactUpdated=1`, req.url));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${targetId}?contactError=${encodeURIComponent('Email or phone is already in use by another account.')}`,
          req.url,
        ),
      );
    }
    console.error('[admin/users/[id] POST]', err);
    return NextResponse.json({ error: 'Failed to update contact details.' }, { status: 500 });
  }
}
