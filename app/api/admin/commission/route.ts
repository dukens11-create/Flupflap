import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMarketplaceSettings } from '@/lib/commission';
import { logError } from '@/lib/logger';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await getMarketplaceSettings();
    return NextResponse.redirect(new URL('/admin?commission=fixed', req.url));
  } catch (err) {
    logError('Failed to update commission settings', err, { tag: 'admin/commission/POST' });
    return NextResponse.json({ error: 'Unable to update commission right now.' }, { status: 500 });
  }
}
