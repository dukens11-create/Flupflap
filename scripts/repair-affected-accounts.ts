import crypto from 'crypto';
import { prisma } from '../lib/db';
import { looksLikeBcryptHash } from '../lib/password';
import { sendEmail } from '../lib/email';
import { passwordResetEmail } from '../lib/email-templates';
import { getSiteUrl } from '../lib/seo';

function parseTargetEmails(argv: string[]) {
  const arg = argv.find((entry) => entry.startsWith('--emails='));
  const csv = arg?.slice('--emails='.length).trim();

  if (!csv) return [];

  return Array.from(
    new Set(
      csv
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
}

type UserDiagnostic = {
  id: string;
  email: string;
  role: string;
  deletedAt: Date | null;
  image: string | null;
  password: string | null;
};

function toDiagnostic(user: UserDiagnostic) {
  const hasValidBcryptFormat = looksLikeBcryptHash(user.password);

  return {
    email: user.email,
    id: user.id,
    role: user.role,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    hasImage: Boolean(user.image),
    imageLength: user.image?.length ?? 0,
    passwordBcryptValid: hasValidBcryptFormat,
  };
}

async function run() {
  const confirm = process.argv.includes('--confirm');
  const targetEmails = parseTargetEmails(process.argv);

  if (targetEmails.length === 0) {
    console.log('[repair-affected-accounts] No target accounts provided.');
    console.log('[repair-affected-accounts] Usage:');
    console.log('  npm run repair:affected-accounts -- --emails=email1@example.com,email2@example.com [--confirm]');
    return;
  }

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: targetEmails } },
      select: {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
        image: true,
        password: true,
      },
      orderBy: { email: 'asc' },
    });

    const diagnostics = users.map(toDiagnostic);
    const withImage = diagnostics.filter((user) => user.hasImage);
    const invalidHashes = diagnostics.filter((user) => !user.passwordBcryptValid);

    console.log('[repair-affected-accounts] Target emails:', targetEmails.join(', '));
    console.log('[repair-affected-accounts] Matched accounts:', diagnostics.map((user) => user.email).join(', ') || '(none)');
    console.log('[repair-affected-accounts] Diagnostics:');
    console.table(diagnostics);
    console.log('[repair-affected-accounts] Accounts with stored profile image:', withImage.map((user) => user.email).join(', ') || '(none)');
    console.log('[repair-affected-accounts] Accounts with invalid bcrypt hash:', invalidHashes.map((user) => user.email).join(', ') || '(none)');

    if (!confirm) {
      console.log('[repair-affected-accounts] Dry run only. Re-run with --confirm to clear profile images and reset broken passwords for affected accounts.');
      return;
    }

    // Step 1: Clear profile images.
    const imageResult = await prisma.user.updateMany({
      where: {
        email: { in: targetEmails },
        image: { not: null },
      },
      data: { image: null },
    });

    console.log(`[repair-affected-accounts] Cleared profile images for ${imageResult.count} account(s).`);

    // Step 2: Reset passwords that were corrupted by the profile-photo upload bug.
    // For each account with an invalid bcrypt hash, set a non-loginable sentinel
    // value and send a password-reset email so the user can recover their account.
    const brokenUsers = users.filter((u) => !looksLikeBcryptHash(u.password) && !u.deletedAt);

    if (brokenUsers.length === 0) {
      console.log('[repair-affected-accounts] No accounts with broken passwords found.');
    } else {
      console.log(`[repair-affected-accounts] Resetting passwords for ${brokenUsers.length} account(s) with invalid hashes:`, brokenUsers.map((u) => u.email).join(', '));

      const appUrl = process.env.NEXT_PUBLIC_SITE_URL
        ?? process.env.NEXT_PUBLIC_APP_URL
        ?? process.env.NEXTAUTH_URL;
      if (!appUrl) {
        console.warn(
          '[repair-affected-accounts] WARNING: No public app URL env var is set. ' +
          'Password-reset links will fall back to the canonical site URL. ' +
          'Set NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_APP_URL, or NEXTAUTH_URL before running this script ' +
          'if the reset link should point somewhere else.',
        );
      }
      const resolvedAppUrl = getSiteUrl();

      for (const user of brokenUsers) {
        // Replace the corrupt value with a sentinel that safeComparePassword
        // rejects cleanly (it fails the bcrypt regex, returns false).
        await prisma.user.update({
          where: { id: user.id },
          data: { password: '!NEEDS_RESET!' },
        });

        // Create a fresh password-reset token (1-hour expiry).
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        const identifier = `password-reset:${user.email}`;

        await prisma.verificationToken.deleteMany({ where: { identifier } });
        await prisma.verificationToken.create({
          data: { identifier, token, expires },
        });

        const resetUrl = new URL('/reset-password', resolvedAppUrl);
        resetUrl.searchParams.set('token', token);
        resetUrl.searchParams.set('email', user.email);

        const { subject, html } = passwordResetEmail(resetUrl.toString());
        const sent = await sendEmail(user.email, subject, html);

        if (sent) {
          console.log(`[repair-affected-accounts] ${user.email}: password sentinel set, reset email sent ✓`);
        } else {
          // The password sentinel is already written; log the reset URL so an
          // operator can share it with the user out-of-band (e.g. via support chat).
          console.error(
            `[repair-affected-accounts] ${user.email}: password sentinel set but reset email FAILED to send ✗. ` +
            `Share this link with the user manually (expires in 1 hour): ${resetUrl.toString()}`,
          );
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('[repair-affected-accounts] Failed:', error);
  process.exit(1);
});
