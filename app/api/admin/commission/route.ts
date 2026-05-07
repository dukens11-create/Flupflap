import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DEFAULT_BOOTSTRAP_COMMISSION_BPS, getMarketplaceSettings } from '@/lib/commission';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const settings = await getMarketplaceSettings();

  await prisma.marketplaceSettings.update({
    where: { id: settings.id },
    data: {
      defaultSellerCommissionBps: DEFAULT_BOOTSTRAP_COMMISSION_BPS,
    },
  });

  return NextResponse.redirect(new URL('/admin?commission=updated', req.url));
}
