/**
 * POST /api/admin/reports/[id]/moderate
 *
 * Allows admins to take moderation actions on a product report.
 *
 * Request body (form data):
 *   action      — required; one of: dismiss | resolve | hide_listing | warn_seller | suspend_seller | ban_seller
 *   adminNotes  — optional; private admin-only notes
 *
 * Side effects by action:
 *   hide_listing   — sets product.status = HIDDEN
 *   warn_seller    — creates a SellerModerationLog (SUSPENDED is not applied, just logged)
 *   suspend_seller — sets seller.sellerStatus = SUSPENDED + SellerModerationLog
 *   ban_seller     — sets seller.sellerStatus = BANNED + SellerModerationLog
 *   dismiss        — marks report DISMISSED, no product/seller change
 *   resolve        — marks report RESOLVED, no additional change
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

// Map product report reasons to the SellerModerationLog reason categories
const REPORT_TO_SELLER_REASON: Record<string, string> = {
  fake_counterfeit: 'fake_product',
  misleading_description: 'misconduct_to_customer',
  misleading_photos: 'misconduct_to_customer',
  prohibited_item: 'policy_violation',
  scam_fraud: 'fraud',
  item_unavailable: 'misconduct_to_customer',
  other: 'other',
};

const VALID_ACTIONS = [
  'dismiss',
  'resolve',
  'hide_listing',
  'warn_seller',
  'suspend_seller',
  'ban_seller',
] as const;

const schema = z.object({
  action: z.enum(VALID_ACTIONS),
  adminNotes: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    const report = await prisma.productReport.findUnique({
      where: { id },
      include: {
        product: { select: { id: true, sellerId: true } },
        seller: { select: { id: true, role: true } },
      },
    });

    if (!report) {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const raw = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, v === '' ? undefined : v]),
    );
    const data = schema.parse(raw);

    const now = new Date();
    const newReportStatus =
      data.action === 'dismiss' ? 'DISMISSED' : 'RESOLVED';

    // Perform action-specific side effects
    if (data.action === 'hide_listing') {
      await prisma.product.update({
        where: { id: report.productId },
        data: { status: 'HIDDEN' },
      });
    }

    if (data.action === 'warn_seller' || data.action === 'suspend_seller' || data.action === 'ban_seller') {
      const sellerAction =
        data.action === 'ban_seller'
          ? 'BANNED'
          : data.action === 'suspend_seller'
            ? 'SUSPENDED'
            : 'WARNED';

      const moderationReason = REPORT_TO_SELLER_REASON[report.reason] ?? 'other';

      if (data.action === 'suspend_seller' || data.action === 'ban_seller') {
        await prisma.user.update({
          where: { id: report.sellerId },
          data: {
            sellerStatus: sellerAction as 'SUSPENDED' | 'BANNED',
            sellerStatusReason: moderationReason,
            sellerStatusNotes: data.adminNotes ?? null,
          },
        });
      }

      await prisma.sellerModerationLog.create({
        data: {
          sellerId: report.sellerId,
          adminId: session.user.id,
          action: sellerAction,
          reasonCategory: moderationReason,
          notes: data.adminNotes ?? null,
        },
      });
    }

    // Update the report
    await prisma.productReport.update({
      where: { id },
      data: {
        status: newReportStatus as any,
        adminId: session.user.id,
        adminAction: data.action,
        adminNotes: data.adminNotes ?? null,
        resolvedAt: now,
        updatedAt: now,
      },
    });

    return NextResponse.redirect(new URL('/admin/reports', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[admin/reports/moderate]', err);
    return NextResponse.json({ error: 'Failed to process report.' }, { status: 500 });
  }
}
