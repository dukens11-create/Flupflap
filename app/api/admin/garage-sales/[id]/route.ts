import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { stripe } from '@/lib/stripe';
import { deriveGarageSaleLifecycle } from '@/lib/garage-sale-lifecycle';
import { recordSellerRefundHistory } from '@/lib/seller-refund-history';
import { calculateGarageSaleDurationDays } from '@/lib/garage-sale-pricing';
import {
  GARAGE_SALE_COMPENSATION_NOTE_REQUIRED_MESSAGE,
  buildGarageSaleCompensationAuditLine,
  buildGarageSaleCompensationSourceKey,
  formatGarageSaleCompensationSummary,
  isGarageSaleCompensationEligible,
  normalizeGarageSaleCompensationNote,
  type GarageSaleCompensationReason,
} from '@/lib/garage-sale-compensation';

export const dynamic = 'force-dynamic';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_COMPENSATION_DURATION_DAYS = 30;

const actionSchema = z.object({
  action: z.enum(['approve', 'reject', 'feature', 'unfeature', 'hide', 'mark_spam', 'unmark_spam', 'refund', 'grant_compensation']),
  notes: z.string().max(1000).optional(),
  promotionType: z.enum(['FEATURED', 'HOMEPAGE_BOOST', 'LOCAL_AREA_BOOST', 'WEEKEND_PROMOTION']).optional().nullable(),
  compensationReason: z.enum(['ended_early', 'system_cutoff']).optional(),
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
      const stripeRefund = await stripe.refunds.create({
        payment_intent: latestPaid.stripePaymentId,
        metadata: {
          type: 'garage_sale_listing',
          saleId: sale.id,
          sellerId: sale.sellerId,
          action: 'admin_refund',
        },
      });
      await prisma.$transaction(async (tx) => {
        await tx.garageSalePayment.update({
          where: { id: latestPaid.id },
          data: { status: 'REFUNDED' },
        });
        await tx.garageSale.update({
          where: { id: sale.id },
          data: {
            paymentStatus: 'REFUNDED',
            status: 'HIDDEN',
            isArchived: true,
            archivedAt: new Date(),
            isFeatured: false,
          },
        });
        await recordSellerRefundHistory({
          sellerId: sale.sellerId,
          saleId: sale.id,
          refundType: 'admin_garage_sale_refund',
          sourceLabel: 'Admin garage sale refund',
          stripePaymentIntentId: latestPaid.stripePaymentId,
          stripeRefundId: stripeRefund.id,
          amountCents: Number.isFinite(stripeRefund.amount) ? stripeRefund.amount : latestPaid.amountCents,
          currency: stripeRefund.currency ?? null,
          status: stripeRefund.status ?? 'succeeded',
          reason: 'Admin-initiated garage sale refund',
          refundedAt: Number.isFinite(stripeRefund.created) ? new Date(stripeRefund.created * 1000) : new Date(),
          resolvedAt: new Date(),
        }, tx);
      });
      const refunded = await prisma.garageSale.findUnique({ where: { id: sale.id } });
      return NextResponse.json(refunded);
    }
    case 'grant_compensation': {
      if (!isGarageSaleCompensationEligible(sale, new Date())) {
        return NextResponse.json({ error: 'Sale is not eligible for early-end compensation' }, { status: 422 });
      }
      const compensationReason: GarageSaleCompensationReason = parsed.data.compensationReason ?? 'ended_early';
      const compensationNote = normalizeGarageSaleCompensationNote(parsed.data.notes);
      if (!compensationNote) {
        return NextResponse.json({ error: GARAGE_SALE_COMPENSATION_NOTE_REQUIRED_MESSAGE }, { status: 422 });
      }
      const sourceKey = buildGarageSaleCompensationSourceKey(sale.id);
      const now = new Date();
      const originalDurationDays = sale.durationDays > 0
        ? sale.durationDays
        : calculateGarageSaleDurationDays(sale.startDate, sale.endDate);
      const durationDays = Math.max(1, Math.min(MAX_COMPENSATION_DURATION_DAYS, originalDurationDays));
      const replacementEndDate = new Date(now.getTime() + durationDays * MS_PER_DAY);
      const grantedBy = session.user.id?.trim();
      if (!grantedBy) {
        return NextResponse.json({ error: 'Invalid admin session' }, { status: 403 });
      }
      const auditPayload = {
        reason: compensationReason,
        note: compensationNote,
        grantedBy,
        sourceSale: sale.id,
        at: now.toISOString(),
      };
      const auditLine = buildGarageSaleCompensationAuditLine(auditPayload);
      const auditSummary = formatGarageSaleCompensationSummary(compensationReason, compensationNote);

      try {
        const replacement = await prisma.$transaction(async (tx) => {
          await tx.sellerRefundHistory.create({
            data: {
              sellerId: sale.sellerId,
              saleId: sale.id,
              refundType: 'garage_sale_early_end_compensation_credit',
              sourceLabel: 'Garage sale early-end replacement credit',
              sourceKey,
              amountCents: 0,
              currency: 'USD',
              status: 'granted',
              reason: auditSummary,
              refundedAt: now,
              resolvedAt: now,
            },
          });

          const createdReplacement = await tx.garageSale.create({
            data: {
              sellerId: sale.sellerId,
              repostOfId: sale.id,
              title: sale.title,
              description: sale.description,
              saleType: sale.saleType,
              listingType: 'STANDARD',
              status: 'APPROVED',
              address: sale.address,
              city: sale.city,
              state: sale.state,
              zipCode: sale.zipCode,
              latitude: sale.latitude,
              longitude: sale.longitude,
              startDate: now,
              endDate: replacementEndDate,
              expirationTimestamp: replacementEndDate,
              durationDays,
              photos: sale.photos,
              videoUrl: sale.videoUrl,
              categories: sale.categories,
              sellerPhone: sale.sellerPhone,
              priceRangeMin: sale.priceRangeMin,
              priceRangeMax: sale.priceRangeMax,
              isFeatured: false,
              homepagePromoted: false,
              topSearchPromoted: false,
              pricePerDayCents: sale.pricePerDayCents,
              // Zeroed amounts represent a granted free compensation credit.
              baseAmountCents: 0,
              addOnsAmountCents: 0,
              totalPaidCents: 0,
              paymentStatus: 'PAID',
              paidAt: now,
              activatedAt: now,
              adminNotes: `${auditLine}; replacementFor=${sale.id}`,
            },
          });

          await tx.garageSalePayment.create({
            data: {
              saleId: createdReplacement.id,
              sellerId: sale.sellerId,
              amountCents: 0,
              status: 'PAID',
            },
          });

          await tx.garageSale.update({
            where: { id: sale.id },
            data: {
              adminNotes: sale.adminNotes
                ? `${sale.adminNotes}\n${buildGarageSaleCompensationAuditLine({ ...auditPayload, replacement: createdReplacement.id })}`
                : buildGarageSaleCompensationAuditLine({ ...auditPayload, replacement: createdReplacement.id }),
            },
          });

          return createdReplacement;
        });

        const refreshedSale = await prisma.garageSale.findUnique({ where: { id: sale.id } });
        return NextResponse.json({
          ...refreshedSale,
          compensationGranted: true,
          compensationReplacementSaleId: replacement.id,
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return NextResponse.json({ error: 'Compensation already granted for this early-ended session' }, { status: 409 });
        }
        throw error;
      }
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
