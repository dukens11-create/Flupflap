import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { stripe } from '@/lib/stripe';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';

export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'feature', 'unfeature', 'hide', 'mark_spam', 'unmark_spam', 'refund']),
  notes: z.string().max(1000).optional(),
  promotionType: z.enum(['FEATURED', 'HOMEPAGE_BOOST', 'LOCAL_AREA_BOOST', 'WEEKEND_PROMOTION']).optional().nullable(),
});

type Params = { params: Promise<{ id: string }> };

/** PATCH /api/admin/garage-sales/[id] — admin moderation actions */
export async function PATCH(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({ where: { id } });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = actionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', issues: parsed.error.issues }, { status: 422 });
  }

  const { action, notes, promotionType } = parsed.data;

  const updates: Record<string, unknown> = {};
  if (notes !== undefined) updates.adminNotes = notes;

  switch (action) {
    case 'approve': {
      if (sale.paymentStatus !== 'PAID') {
        return NextResponse.json(
          { error: 'Payment must be completed before approval.' },
          { status: 422 },
        );
      }
      const lifecycleIfApproved = deriveGarageSaleLifecycle({
        status: 'APPROVED',
        paymentStatus: sale.paymentStatus,
        isArchived: sale.isArchived,
        startDate: sale.startDate,
        endDate: sale.endDate,
        isLive: sale.isLive,
      });
      if (!lifecycleIfApproved.publiclyVisible) {
        return NextResponse.json({ error: lifecycleIfApproved.ownerMessage }, { status: 422 });
      }
      updates.status = 'APPROVED';
      break;
    }
    case 'reject':
      updates.status = 'REJECTED';
      break;
    case 'feature':
      updates.isFeatured = true;
      if (promotionType) updates.promotionType = promotionType;
      break;
    case 'unfeature':
      updates.isFeatured = false;
      updates.promotionType = null;
      break;
    case 'hide':
      updates.status = 'HIDDEN';
      break;
    case 'mark_spam':
      updates.isSpam = true;
      updates.status = 'HIDDEN';
      break;
    case 'unmark_spam':
      updates.isSpam = false;
      break;
    case 'refund': {
      const latestPaid = await prisma.garageSalePayment.findFirst({
        where: {
          saleId: sale.id,
          status: 'PAID',
          stripePaymentId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!latestPaid?.stripePaymentId) {
        return NextResponse.json({ error: 'No refundable payment found' }, { status: 400 });
      }
      await stripe.refunds.create({
        payment_intent: latestPaid.stripePaymentId,
      });
      await prisma.$transaction([
        prisma.garageSalePayment.update({
          where: { id: latestPaid.id },
          data: { status: 'REFUNDED' },
        }),
        prisma.garageSale.update({
          where: { id: sale.id },
          data: {
            paymentStatus: 'REFUNDED',
            status: 'HIDDEN',
            isArchived: true,
            archivedAt: new Date(),
            isFeatured: false,
          },
        }),
      ]);
      const refunded = await prisma.garageSale.findUnique({ where: { id: sale.id } });
      return NextResponse.json(refunded);
    }
  }

  const updated = await prisma.garageSale.update({ where: { id }, data: updates });
  return NextResponse.json(updated);
}

/** DELETE /api/admin/garage-sales/[id] — admin delete */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  const sale = await prisma.garageSale.findUnique({ where: { id } });
  if (!sale) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.garageSale.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
