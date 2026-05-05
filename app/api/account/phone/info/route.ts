/**
 * GET /api/account/phone/info
 *
 * Returns the current user's phone number and verification status.
 * Used by the account settings page to display current phone info.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, phoneVerified: true, phoneVerifiedAt: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }

    return NextResponse.json({
      phone: user.phone,
      phoneVerified: user.phoneVerified,
      phoneVerifiedAt: user.phoneVerifiedAt,
    });
  } catch (err) {
    console.error('[account/phone/info]', err);
    return NextResponse.json({ error: 'Server error.' }, { status: 500 });
  }
}
