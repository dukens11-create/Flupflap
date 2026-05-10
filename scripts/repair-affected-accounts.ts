import { prisma } from '../lib/db';
import { looksLikeBcryptHash } from '../lib/password';

const TARGET_EMAILS = [
  'dukens0411@gmail.com',
  'admin@flupflap.com',
  'seller@flupflap.com',
] as const;

type UserDiagnostic = {
  id: string;
  email: string;
  role: string;
  deletedAt: Date | null;
  image: string | null;
  password: string;
};

function toDiagnostic(user: UserDiagnostic) {
  const password = user.password;
  const bcryptValid = looksLikeBcryptHash(password);

  return {
    email: user.email,
    id: user.id,
    role: user.role,
    deletedAt: user.deletedAt?.toISOString() ?? null,
    hasImage: Boolean(user.image),
    imageLength: user.image?.length ?? 0,
    passwordBcryptValid: bcryptValid,
    passwordLength: typeof password === 'string' ? password.length : 0,
    passwordPrefix: typeof password === 'string' ? password.slice(0, 4) : '(non-string)',
  };
}

async function run() {
  const confirm = process.argv.includes('--confirm');

  try {
    const users = await prisma.user.findMany({
      where: { email: { in: [...TARGET_EMAILS] } },
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

    console.log('[repair-affected-accounts] Target emails:', TARGET_EMAILS.join(', '));
    console.log('[repair-affected-accounts] Matched accounts:', diagnostics.map((user) => user.email).join(', ') || '(none)');
    console.log('[repair-affected-accounts] Diagnostics:');
    console.table(diagnostics);
    console.log('[repair-affected-accounts] Accounts with stored profile image:', withImage.map((user) => user.email).join(', ') || '(none)');
    console.log('[repair-affected-accounts] Accounts with invalid bcrypt hash:', invalidHashes.map((user) => user.email).join(', ') || '(none)');

    if (!confirm) {
      console.log('[repair-affected-accounts] Dry run only. Re-run with --confirm to set image = null for affected accounts.');
      return;
    }

    const result = await prisma.user.updateMany({
      where: {
        email: { in: [...TARGET_EMAILS] },
        image: { not: null },
      },
      data: { image: null },
    });

    console.log(`[repair-affected-accounts] Updated ${result.count} account(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((error) => {
  console.error('[repair-affected-accounts] Failed:', error);
  process.exit(1);
});
