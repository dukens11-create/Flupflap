import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { approveAdminRefund, rejectAdminRefund, resolveAdminRefund } from '@/lib/admin-refunds';
import { sessionHasRole } from '@/lib/user-roles';

const adminRefundSchema = z.object({
  action: z.enum(['approve', 'deny', 'resolve']),
  approvedAmountCents: z.number().int().positive().optional(),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const parsed = adminRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

  const actionResult = parsed.data.action === 'approve'
    ? await approveAdminRefund({
      refundId: id,
      adminUserId: session.user.id,
      adminNote: parsed.data.adminNotes,
      approvedAmountCents: parsed.data.approvedAmountCents,
    })
    : parsed.data.action === 'resolve'
      ? await resolveAdminRefund({
        refundId: id,
        adminUserId: session.user.id,
        adminNote: parsed.data.adminNotes,
        approvedAmountCents: parsed.data.approvedAmountCents,
      })
      : await rejectAdminRefund({
        refundId: id,
        adminUserId: session.user.id,
        adminNote: parsed.data.adminNotes,
      });

  if (!actionResult.ok) {
    return NextResponse.json({ error: actionResult.error }, { status: actionResult.status });
  }

  return NextResponse.json(actionResult.refund);
}
