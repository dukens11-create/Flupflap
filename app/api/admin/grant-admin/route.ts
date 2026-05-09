/**
 * POST /api/admin/grant-admin
 *
 * Admin-only endpoint to promote an existing user to the ADMIN role.
 * Accepts an email address and/or a phone number; at least one must be provided.
 * Normalizes the phone to E.164 before the lookup so callers can supply any
 * common US/international format.
 *
 * Request body (JSON):
 *   { email?: string; phone?: string }
 *
 * Responses:
 *   200 { message, user: { id, name, email, phone, role } }  — promoted successfully
 *   400 { error }  — missing / invalid inputs or user already ADMIN
 *   401 { error }  — not authenticated
 *   403 { error }  — caller is not ADMIN
 *   404 { error }  — no user found for the supplied email/phone
 *   500 { error }  — unexpected server error
 *
 * Side-effects:
 *   - Updates User.role to 'ADMIN'.
 *   - Creates an AdminAccessLog entry with action 'grant_admin'.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { normalizePhone } from '@/lib/phone';

export async function POST(req: Request) {
  try {
    // --- Auth guard ----------------------------------------------------------
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // --- Input validation ----------------------------------------------------
    const body = await req.json().catch(() => ({}));
    const rawEmail: unknown = body?.email;
    const rawPhone: unknown = body?.phone;

    const email =
      typeof rawEmail === 'string' && rawEmail.trim() !== ''
        ? rawEmail.trim().toLowerCase()
        : null;

    const phone =
      typeof rawPhone === 'string' && rawPhone.trim() !== ''
        ? normalizePhone(rawPhone.trim())
        : null;

    // normalizePhone returns null for clearly invalid numbers
    if (typeof rawPhone === 'string' && rawPhone.trim() !== '' && phone === null) {
      return NextResponse.json(
        { error: 'Invalid phone number format.' },
        { status: 400 },
      );
    }

    if (!email && !phone) {
      return NextResponse.json(
        { error: 'Provide at least one of: email, phone.' },
        { status: 400 },
      );
    }

    // --- User lookup ---------------------------------------------------------
    // Build OR conditions from whichever identifiers were supplied
    const orConditions: Array<{ email: string } | { phone: string }> = [];
    if (email) orConditions.push({ email });
    if (phone) orConditions.push({ phone });

    const user = await prisma.user.findFirst({
      where: { OR: orConditions },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'No user found with the supplied email or phone.' },
        { status: 404 },
      );
    }

    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'User is already an ADMIN.', user },
        { status: 400 },
      );
    }

    // --- Promote to ADMIN ----------------------------------------------------
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN' },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });

    // --- Audit log -----------------------------------------------------------
    await prisma.adminAccessLog.create({
      data: {
        adminId: session.user.id,
        targetId: user.id,
        action: 'grant_admin',
        notes: `Promoted to ADMIN by ${session.user.email ?? session.user.id}`,
      },
    });

    console.log(
      `[grant-admin] ${session.user.email ?? session.user.id} promoted user ${user.id} (${user.email}) to ADMIN`,
    );

    return NextResponse.json({
      message: `User ${updated.name ?? updated.email} has been granted ADMIN access.`,
      user: updated,
    });
  } catch (err) {
    console.error('[admin/grant-admin POST]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
