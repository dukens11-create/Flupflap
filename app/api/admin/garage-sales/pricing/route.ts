import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getMarketplaceSettings } from '@/lib/commission';

function toCents(value: FormDataEntryValue | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function redirectWithMessage(path: string, key: 'success' | 'error', message: string, req: Request) {
  const url = new URL(path, req.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const form = await req.formData();
  const standardPriceCents = toCents(form.get('garageStandardPrice'));
  const featuredPriceCents = toCents(form.get('garageFeaturedPrice'));
  const homepagePromoCents = toCents(form.get('garageHomepagePromoPrice'));
  const topSearchCents = toCents(form.get('garageTopSearchPrice'));

  if (standardPriceCents == null || featuredPriceCents == null || homepagePromoCents == null || topSearchCents == null) {
    return redirectWithMessage('/admin/garage-sales', 'error', 'Invalid pricing values.', req);
  }

  const settings = await getMarketplaceSettings();

  await prisma.marketplaceSettings.update({
    where: { id: settings.id },
    data: {
      garageStandardPriceCents: standardPriceCents,
      garageFeaturedPriceCents: featuredPriceCents,
      garageHomepagePromoEnabled: form.get('garageHomepagePromoEnabled') === 'on',
      garageHomepagePromoCents: homepagePromoCents,
      garageTopSearchEnabled: form.get('garageTopSearchEnabled') === 'on',
      garageTopSearchCents: topSearchCents,
      garageFirstListingFree: form.get('garageFirstListingFree') === 'on',
      garageSalesFree: form.get('garageSalesFree') === 'on',
    },
  });

  return redirectWithMessage('/admin/garage-sales', 'success', 'Garage sale pricing updated.', req);
}
