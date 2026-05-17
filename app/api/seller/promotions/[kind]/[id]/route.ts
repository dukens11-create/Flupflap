import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { parseSalesPromotionForm } from '@/lib/seller-promotion-form';
import { getPromotionDetailHref, isPromotionRouteKind, toDbPromotionKind } from '@/lib/seller-promotions';

export const dynamic = 'force-dynamic';

function redirectWithMessage(path: string, key: 'error' | 'success', message: string, req: Request) {
  const url = new URL(path, req.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

function respondError(req: Request, kind: string, id: string, message: string, status = 400) {
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes('application/json')) {
    return NextResponse.json({ error: message }, { status });
  }
  return redirectWithMessage(`/seller/promotions/${kind}/${id}/edit`, 'error', message, req);
}

export async function POST(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER' || !session.user.id) {
    return respondError(req, 'discounts', 'unknown', 'Forbidden', 403);
  }

  const { kind, id } = await params;
  if (!isPromotionRouteKind(kind)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const sellerId = session.user.id;
  const existing = await prisma.salesPromotion.findFirst({
    where: { id, sellerId, kind: toDbPromotionKind(kind) },
    select: { id: true },
  });
  if (!existing) {
    return respondError(req, kind, id, 'Promotion not found.', 404);
  }

  const form = await req.formData();
  const parsed = parseSalesPromotionForm(form, kind);
  if (!parsed.data) {
    return respondError(req, kind, id, parsed.error ?? 'Invalid promotion data.');
  }

  const ownedProductIds = [
    ...parsed.data.applicableProductIds,
    ...(parsed.data.rewardProductId ? [parsed.data.rewardProductId] : []),
  ];
  if (ownedProductIds.length > 0) {
    const products = await prisma.product.findMany({
      where: { sellerId, id: { in: [...new Set(ownedProductIds)] } },
      select: { id: true },
    });
    if (products.length !== [...new Set(ownedProductIds)].length) {
      return respondError(req, kind, id, 'Selected listings must belong to your seller account.', 403);
    }
  }

  await prisma.salesPromotion.update({
    where: { id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      status: parsed.data.status,
      startsAt: parsed.data.startsAt,
      endsAt: parsed.data.endsAt,
      applicableProductIds: parsed.data.applicableProductIds,
      totalUsageLimit: parsed.data.totalUsageLimit,
      perCustomerLimit: parsed.data.perCustomerLimit,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      triggerType: parsed.data.triggerType,
      triggerValue: parsed.data.triggerValue,
      rewardType: parsed.data.rewardType,
      rewardProductId: parsed.data.rewardProductId,
      rewardQuantity: parsed.data.rewardQuantity ?? undefined,
      archivedAt: parsed.data.status === 'ARCHIVED' ? new Date() : null,
    },
  });

  return redirectWithMessage(getPromotionDetailHref(kind, id), 'success', `${kind === 'discounts' ? 'Discount' : 'Offer'} updated successfully.`, req);
}
