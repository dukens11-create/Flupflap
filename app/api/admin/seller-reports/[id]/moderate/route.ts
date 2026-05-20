import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { sessionHasRole } from '@/lib/user-roles';

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
    if (!session?.user || !sessionHasRole(session.user, 'ADMIN')) {
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

    if (data.action === 'warn_seller') {
      await prisma.sellerModerationLog.create({
        data: {
          sellerId: report.sellerId,
          adminId: session.user.id,
          action: 'WARNED',
          reasonCategory: moderationReason,
          notes: data.adminNotes ?? null,
        },
      });
    } else if (data.action === 'suspend_seller' || data.action === 'ban_seller') {
      const sellerAction = data.action === 'ban_seller' ? 'BANNED' : 'SUSPENDED';

      await prisma.user.update({
        where: { id: report.sellerId },
        data: {
          sellerStatus: sellerAction,
          sellerStatusReason: moderationReason,
          sellerStatusNotes: data.adminNotes ?? null,
        },
      });

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

    // Fetch calls (from client components) get a JSON response.
    // Native form POSTs get a redirect so the page refreshes with flash message.
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.redirect(new URL('/admin/fraud?success=Seller+report+actioned.', req.url));
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      if (req.headers.get('accept')?.includes('application/json')) {
        return NextResponse.json({ error: 'Invalid input — please select an action.' }, { status: 400 });
      }
      const errUrl = new URL('/admin/fraud', req.url);
      errUrl.searchParams.set('error', 'Invalid input — please select an action.');
      return NextResponse.redirect(errUrl, 302);
    }
    console.error('[admin/seller-reports/moderate]', error);
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ error: 'Failed to process seller report. Please try again.' }, { status: 500 });
    }
    const errUrl = new URL('/admin/fraud', req.url);
    errUrl.searchParams.set('error', 'Failed to process seller report. Please try again.');
    return NextResponse.redirect(errUrl, 302);
  }
}
