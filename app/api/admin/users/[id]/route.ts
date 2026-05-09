/**
 * /api/admin/users/[id]
 *
 * GET  - Admin-only endpoint to retrieve full account details for a specific user.
 * POST - Admin-only endpoint to update a user's contact details (email/phone).
 *
 * GET returns profile, orders, listings (for sellers), and moderation history.
 * Both handlers avoid exposing password hashes or raw authentication secrets and
 * log admin actions to AdminAccessLog for audit purposes.
 *
 * Origin handling (POST):
 *   Legitimate admin requests are validated against trusted origins derived from
 *   configured app URLs (`NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`) plus the request
 *   host headers forwarded by the deployment platform. This prevents false
 *   rejections when frontend and backend hostnames differ in production.
 *   Requests without an Origin header (same-origin form posts) are always allowed.
 *   Requests from an unrecognised origin are still rejected with 403.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

/**
 * Origins derived from the configured app URL env vars, computed once at
 * module load.  Mirrors the env-var convention used in proxy.ts and
 * lib/stripe.ts (`NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL`).
 */
function buildConfiguredTrustedOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const raw of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_APP_URL]) {
    if (!raw) continue;
    const normalized = normalizeOrigin(raw);
    if (normalized) origins.add(normalized);
  }
  return origins;
}

function normalizeOrigin(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

function deriveTrustedRequestOrigins(req: Request): Set<string> {
  const origins = new Set<string>(CONFIGURED_TRUSTED_ORIGINS);
  const requestOrigin = normalizeOrigin(req.url);
  if (requestOrigin) origins.add(requestOrigin);

  const forwardedHost = req.headers
    .get('x-forwarded-host')
    ?.split(',')
    .map(value => value.trim())
    .find(Boolean);
  const host = forwardedHost ?? req.headers.get('host')?.trim();
  const proto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
  if (host && (proto === 'http' || proto === 'https')) {
    try {
      origins.add(new URL(`${proto}://${host}`).origin.toLowerCase());
    } catch {
      // ignore malformed host/proto values
    }
  }
  return origins;
}

const CONFIGURED_TRUSTED_ORIGINS = buildConfiguredTrustedOrigins();

const contactSchema = z.object({
  email: z.string().trim().email('Invalid email format.').transform(value => value.toLowerCase()),
  phone: z.string().optional(),
});

const EDITABLE_ROLES: ReadonlyArray<string> = ['SELLER', 'CUSTOMER'];

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
    const origin = req.headers.get('origin');
    if (origin) {
      const normalizedOrigin = normalizeOrigin(origin);
      const trustedOrigins = deriveTrustedRequestOrigins(req);
      if (!normalizedOrigin || !trustedOrigins.has(normalizedOrigin)) {
        return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
      }
    }

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
      phone: form.get('phone'),
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
      select: { id: true, role: true, email: true, phone: true },
    });
    if (!existingUser || !EDITABLE_ROLES.includes(existingUser.role)) {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${id}?contactError=${encodeURIComponent('User not found.')}`,
          req.url,
        ),
      );
    }

    const email = parsed.data.email;
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
    const emailChanged = existingUser.email !== email;
    if (!phoneChanged && !emailChanged) {
      return NextResponse.redirect(new URL(`/admin/users/${id}?contactNoop=1`, req.url));
    }

    await prisma.user.update({
      where: { id },
      data: {
        email,
        phone,
        ...(phoneChanged ? { phoneVerified: false, phoneVerifiedAt: null } : {}),
      },
    });

    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: id,
        action: 'update_contact',
        notes: [
          emailChanged ? `email: ${existingUser.email} -> ${email}` : null,
          phoneChanged ? `phone: ${existingUser.phone ?? 'none'} -> ${phone ?? 'none'}` : null,
          `by ${session.user.email ?? session.user.id}`,
        ]
          .filter(Boolean)
          .join('; '),
      },
    });

    return NextResponse.redirect(new URL(`/admin/users/${id}?contactUpdated=1`, req.url));
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.redirect(
        new URL(
          `/admin/users/${targetId}?contactError=${encodeURIComponent('Phone number is already in use by another account.')}`,
          req.url,
        ),
      );
    }
    console.error('[admin/users/[id] POST]', err);
    return NextResponse.json({ error: 'Failed to update contact details.' }, { status: 500 });
  }
}
