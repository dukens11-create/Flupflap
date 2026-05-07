import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMarketplaceSettings } from '@/lib/commission';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await getMarketplaceSettings();
  return NextResponse.redirect(new URL('/admin?commission=fixed', req.url));
}
