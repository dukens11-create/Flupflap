import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { getMarketplaceSettings } from '@/lib/commission';
import { logError } from '@/lib/logger';
import { sessionHasRole } from '@/lib/user-roles';

const COMMISSION_SUCCESS_QUERY = 'commission=fixed';

function isJsonRequest(req: Request) {
  return (req.headers.get('accept') ?? '').includes('application/json');
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !sessionHasRole(session.user, 'ADMIN')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await getMarketplaceSettings();
    if (isJsonRequest(req)) {
      return NextResponse.json({ ok: true, message: 'Commission settings validated.' });
    }
    return NextResponse.redirect(new URL(`/admin?${COMMISSION_SUCCESS_QUERY}`, req.url), 303);
  } catch (err) {
    logError('Failed to validate commission settings', err, {
      tag: 'admin/commission',
      action: 'post',
    });
    if (isJsonRequest(req)) {
      return NextResponse.json(
        { error: 'Unable to load commission settings right now. Please try again.' },
        { status: 500 },
      );
    }
    const errUrl = new URL('/admin', req.url);
    errUrl.searchParams.set('error', 'Unable to load commission settings right now. Please try again.');
    return NextResponse.redirect(errUrl, 303);
  }
}
