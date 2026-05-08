import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const VALID_ACTIONS = [
  'dismiss',
  'resolve',
  'warn_seller',
  'suspend_seller',
  'ban_seller',
] as const;

const REPORT_REASON_TO_MODERATION_REASON: Record<string, string> = {
  scam_fraud: 'fraud',
  off_platform_payment: 'policy_violation',
  counterfeit_behavior: 'fake_product',
  non_delivery: 'misconduct_to_customer',
  abusive_behavior: 'misconduct_to_customer',
  other: 'other',
};

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
    const report = await prisma.sellerReport.findUnique({ where: { id } });
    if (!report) {
      return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const raw = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, value === '' ? undefined : value]),
    );
    const data = schema.parse(raw);

    const moderationReason = REPORT_REASON_TO_MODERATION_REASON[report.reason] ?? 'other';
    const now = new Date();

    if (data.action === 'warn_seller' || data.action === 'suspend_seller' || data.action === 'ban_seller') {
      const sellerAction =
        data.action === 'ban_seller'
          ? 'BANNED'
          : data.action === 'suspend_seller'
            ? 'SUSPENDED'
            : 'WARNED';

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

    await prisma.sellerReport.update({
      where: { id },
      data: {
        status: data.action === 'dismiss' ? 'DISMISSED' : 'RESOLVED',
        adminId: session.user.id,
        adminAction: data.action,
        adminNotes: data.adminNotes ?? null,
        resolvedAt: now,
      },
    });

    return NextResponse.redirect(new URL('/admin/fraud', req.url));
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }
    console.error('[admin/seller-reports/moderate]', error);
    return NextResponse.json({ error: 'Failed to process seller report.' }, { status: 500 });
  }
}
