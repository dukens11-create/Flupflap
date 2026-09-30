import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sendReloadlyTopup } from '@/lib/reloadly-airtime';
import { createAirtimeSaleHandler } from '@/lib/airtime-agent-sales';

export const dynamic = 'force-dynamic';

export const POST = createAirtimeSaleHandler({
  db: prisma,
  session: () => getServerSession(authOptions),
  submit: sendReloadlyTopup,
  accountCurrency: () => (process.env.RELOADLY_ACCOUNT_CURRENCY ?? 'USD').trim().toUpperCase(),
});
