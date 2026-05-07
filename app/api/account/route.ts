import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { ACCOUNT_DELETION_REASONS } from '@/lib/account-deletion';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const profileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json() as { name?: string; currentPassword?: string; newPassword?: string };

    // Password change request
    if (body.currentPassword !== undefined || body.newPassword !== undefined) {
      const { currentPassword, newPassword } = passwordSchema.parse(body);
      const user = await prisma.user.findUnique({ where: { id: session.user.id } });
      if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 400 });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: session.user.id }, data: { password: hashed } });
      return NextResponse.json({ ok: true, message: 'Password updated.' });
    }

    // Profile update request
    const { name } = profileSchema.parse(body);
    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { name },
      select: { id: true, name: true, email: true, role: true },
    });

    return NextResponse.json({ ok: true, user: updated });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    console.error('[account PATCH]', err);
    return NextResponse.json({ error: 'Failed to update account.' }, { status: 500 });
  }
}

const deleteSchema = z.object({
  password: z.string().min(1, 'Password is required to confirm account deletion.'),
  reason: z.enum(ACCOUNT_DELETION_REASONS, { message: 'Please choose a deletion reason.' }),
  otherDetails: z.string().trim().max(500, 'Please keep details under 500 characters.').optional(),
}).superRefine((value, ctx) => {
  if (value.reason === 'other' && !value.otherDetails) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['otherDetails'],
      message: 'Please provide details when selecting Other.',
    });
  }
});

/**
 * DELETE /api/account
 *
 * Permanently deletes the signed-in user's account. Requires password
 * confirmation. All personal data (addresses, sessions, OAuth accounts,
 * phone tokens, OTPs, conversations, messages) is removed. Seller products
 * are hidden so existing order records remain intact. The User row itself
 * is anonymised (name / email / password wiped) so that FK relationships
 * pointing to orders and products stay valid for other users' records.
 */
export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { password, reason, otherDetails } = deleteSchema.parse(body);

    const userId = session.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, role: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found.' }, { status: 404 });
    }
    if (user.role === 'ADMIN') {
      return NextResponse.json(
        { error: 'Admin accounts cannot be deleted.' },
        { status: 403 },
      );
    }

    // Verify password before deletion
    if (!user.password) {
      return NextResponse.json(
        { error: 'Password deletion is not available for accounts without a password set (e.g. OAuth-only accounts). Please contact support.' },
        { status: 400 },
      );
    }
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 400 });
    }

    // Scrub personal data and revoke all access in a single transaction.
    // We anonymise rather than hard-delete the User row so that FK references
    // from orders and products remain valid for other parties' records.
    await prisma.$transaction(async (tx) => {
      // 1. Revoke all auth sessions and OAuth accounts (cascade covers these,
      //    but we do it explicitly to be safe before the user row update).
      await tx.session.deleteMany({ where: { userId } });
      await tx.account.deleteMany({ where: { userId } });
      await tx.sellerOtp.deleteMany({ where: { userId } });
      await tx.phoneVerificationToken.deleteMany({ where: { userId } });

      // 2. Remove personal addresses.
      await tx.address.deleteMany({ where: { userId } });

      // 3. Remove conversations and all their messages (messages cascade on
      //    conversationId). Delete messages sent by the user first to avoid
      //    FK conflicts on the senderId column, then drop the conversations.
      await tx.message.deleteMany({ where: { senderId: userId } });
      await tx.conversation.deleteMany({
        where: { OR: [{ buyerId: userId }, { sellerId: userId }] },
      });

      // 4. Remove product reports filed by or about this user.
      //    adminId is nullable – null it out first to avoid FK issues when the
      //    user is an admin who resolved someone else's report.
      await tx.productReport.updateMany({
        where: { adminId: userId },
        data: { adminId: null, adminAction: null, adminNotes: null },
      });
      await tx.productReport.deleteMany({
        where: { OR: [{ reporterId: userId }, { sellerId: userId }] },
      });

      // 5. Remove seller moderation logs involving this user.
      await tx.sellerModerationLog.deleteMany({
        where: { OR: [{ sellerId: userId }, { adminId: userId }] },
      });

      // 6. Remove admin access logs involving this user.
      await tx.adminAccessLog.deleteMany({
        where: { OR: [{ adminId: userId }, { targetId: userId }] },
      });

      // 7. Hide all seller products so they no longer appear in listings.
      //    We do not delete them because OrderItem rows from other buyers
      //    reference the product rows.
      await tx.product.updateMany({
        where: { sellerId: userId },
        data: { status: 'HIDDEN' },
      });

      // 8. Anonymise the user record so no personal data remains but FK
      //    integrity is preserved for orders and products owned by others.
      const ghost = `deleted+${userId}@deleted.invalid`;
      await tx.user.update({
        where: { id: userId },
        data: {
          name: 'Deleted User',
          email: ghost,
          // A non-bcrypt placeholder that can never match a real login attempt.
          password: '!DELETED!',
          phone: null,
          phoneVerified: false,
          phoneVerifiedAt: null,
          stripeAccountId: null,
          stripeAccountMode: null,
          stripeOnboardingComplete: false,
          deletedAt: new Date(),
          deletionReason: reason,
          deletionReasonOther: reason === 'other' ? (otherDetails ?? null) : null,
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: err.errors[0]?.message || 'Invalid input.' }, { status: 400 });
    }
    console.error('[account DELETE]', err);
    return NextResponse.json({ error: 'Failed to delete account.' }, { status: 500 });
  }
}
