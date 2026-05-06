import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getMarketplaceSettings, percentToBasisPoints } from '@/lib/commission';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await req.formData();
  const rawPercent = Number(form.get('defaultSellerCommissionPercent'));

  if (!Number.isFinite(rawPercent) || rawPercent < 0 || rawPercent > 100) {
    return NextResponse.redirect(new URL('/admin?commission=invalid', req.url));
  }

  const settings = await getMarketplaceSettings();

  await prisma.marketplaceSettings.update({
    where: { id: settings.id },
    data: {
      defaultSellerCommissionBps: percentToBasisPoints(rawPercent),
    },
  });

  return NextResponse.redirect(new URL('/admin?commission=updated', req.url));
}
