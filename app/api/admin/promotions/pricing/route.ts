import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DEFAULT_PROMOTION_PLANS, ensurePromotionPlans } from '@/lib/promotions';
import { getMarketplaceSettings } from '@/lib/commission';

const MIN_FREE_PROMOTION_DURATION_DAYS = 1;
const MIN_PROMOTION_CREDITS = 1;

function centsFromDollars(value: FormDataEntryValue | null) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * 100);
}

function isJsonRequest(req: Request) {
  return (req.headers.get('accept') ?? '').includes('application/json');
}

function redirectWithMessage(path: string, key: 'error' | 'success', message: string, req: Request) {
  const url = new URL(path, req.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

function respondError(req: Request, message: string, status: number, redirectPath = '/admin/promotions') {
  if (isJsonRequest(req)) {
    return NextResponse.json({ error: message }, { status });
  }
  return redirectWithMessage(redirectPath, 'error', message, req);
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return respondError(req, 'Forbidden', 403);
    }

    const form = await req.formData();
    const action = String(form.get('action') ?? 'pricing');
    await ensurePromotionPlans();

    if (action === 'free_settings') {
      const settings = await getMarketplaceSettings();
      const freePromotionEnabled = form.get('freePromotionEnabled') === 'on';
      const durationRaw = Number(form.get('freePromotionDurationDays'));
      if (!Number.isInteger(durationRaw) || durationRaw < MIN_FREE_PROMOTION_DURATION_DAYS) {
        return respondError(req, 'Free promotion duration must be a whole number of days (minimum 1).', 400);
      }
      const freePromotionDurationDays = durationRaw;
      await prisma.marketplaceSettings.update({
        where: { id: settings.id },
        data: { freePromotionEnabled, freePromotionDurationDays },
      });
      return redirectWithMessage('/admin/promotions', 'success', 'Free promotion settings updated.', req);
    }

    if (action === 'grant_credits') {
      const sellerId = String(form.get('sellerId') ?? '');
      const rawCredits = Number(form.get('credits'));
      if (!sellerId) {
        return respondError(req, 'Seller is required.', 400);
      }
      if (!Number.isInteger(rawCredits) || rawCredits < MIN_PROMOTION_CREDITS) {
        return respondError(req, 'Credit amount must be a whole number (minimum 1).', 400);
      }
      const credits = rawCredits;
      const updated = await prisma.user.updateMany({
        where: { id: sellerId, role: 'SELLER' },
        data: { promotionCredits: { increment: credits } },
      });
      if (updated.count === 0) {
        return respondError(req, 'Seller not found.', 404);
      }
      return redirectWithMessage('/admin/promotions', 'success', 'Credits granted.', req);
    }

    for (const plan of DEFAULT_PROMOTION_PLANS) {
      const priceCents = centsFromDollars(form.get(`price_${plan.durationDays}`));
      if (priceCents === null) {
        return respondError(req, `Invalid price for ${plan.label}.`, 400);
      }
      await prisma.promotionPlan.update({
        where: { durationDays: plan.durationDays },
        data: { priceCents },
      });
    }

    return redirectWithMessage('/admin/promotions', 'success', 'Promotion pricing saved.', req);
  } catch (err) {
    console.error('[api/admin/promotions/pricing] unexpected error', err);
    return respondError(req, 'Unable to update promotion settings right now. Please try again.', 500);
  }
}
