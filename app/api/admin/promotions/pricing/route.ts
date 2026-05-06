import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { DEFAULT_PROMOTION_PLANS, ensurePromotionPlans } from '@/lib/promotions';

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

  const form = await req.formData();
  await ensurePromotionPlans();

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
}
