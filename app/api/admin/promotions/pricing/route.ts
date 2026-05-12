import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DEFAULT_PROMOTION_PLANS, ensurePromotionPlans } from '@/lib/promotions';
import { getMarketplaceSettings } from '@/lib/commission';

function centsFromDollars(value: FormDataEntryValue | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const form = await req.formData();
    const action = String(form.get('action') ?? 'pricing');
    await ensurePromotionPlans();

    if (action === 'free_settings') {
      const settings = await getMarketplaceSettings();
      const freePromotionEnabled = form.get('freePromotionEnabled') === 'on';
      const durationRaw = Number(form.get('freePromotionDurationDays'));
      if (!Number.isInteger(durationRaw) || durationRaw < 1) {
        return NextResponse.json({ error: 'Free promotion duration must be a whole number of days (minimum 1).' }, { status: 400 });
      }
      const freePromotionDurationDays = durationRaw;
      await prisma.marketplaceSettings.update({
        where: { id: settings.id },
        data: { freePromotionEnabled, freePromotionDurationDays },
      });
      return NextResponse.redirect(new URL('/admin/promotions', req.url));
    }

    if (action === 'grant_credits') {
      const sellerId = String(form.get('sellerId') ?? '');
      const rawCredits = Number(form.get('credits'));
      if (!sellerId) {
        return NextResponse.json({ error: 'Seller is required.' }, { status: 400 });
      }
      if (!Number.isInteger(rawCredits) || rawCredits < 1) {
        return NextResponse.json({ error: 'Credit amount must be a whole number (minimum 1).' }, { status: 400 });
      }
      const credits = rawCredits;
      const updated = await prisma.user.updateMany({
        where: { id: sellerId, role: 'SELLER' },
        data: { promotionCredits: { increment: credits } },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
      }
      return NextResponse.redirect(new URL('/admin/promotions', req.url));
    }

    for (const plan of DEFAULT_PROMOTION_PLANS) {
      const priceCents = centsFromDollars(form.get(`price_${plan.durationDays}`));
      if (priceCents === null) {
        return NextResponse.json({ error: `Invalid price for ${plan.label}.` }, { status: 400 });
      }
      await prisma.promotionPlan.update({
        where: { durationDays: plan.durationDays },
        data: { priceCents },
      });
    }

    return NextResponse.redirect(new URL('/admin/promotions', req.url));
  } catch (err) {
    console.error('[admin/promotions/pricing POST]', err);
    return NextResponse.json({ error: 'Failed to save promotion settings.' }, { status: 500 });
  }
}
