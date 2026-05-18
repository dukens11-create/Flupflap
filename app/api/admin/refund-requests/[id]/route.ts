import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import {
  AdminRefundActionError,
  approveAdminRefundRequest,
  rejectAdminRefundRequest,
  resolveAdminRefundRequest,
} from '@/lib/admin-refunds';
import { logError } from '@/lib/logger';

// Keep legacy `deny` support for older clients while new admin routes use `reject`.
const adminRefundSchema = z.object({
  action: z.enum(['approve', 'deny', 'reject', 'resolve']),
  approvedAmountCents: z.number().int().positive().optional(),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
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

  try {
    if (parsed.data.action === 'approve') {
      const approved = await approveAdminRefundRequest({
        refundRequestId: id,
        adminUserId: session.user.id,
        approvedAmountCents: parsed.data.approvedAmountCents,
        adminNotes: parsed.data.adminNotes,
      });
      return NextResponse.json(approved);
    }

    if (parsed.data.action === 'resolve') {
      const resolved = await resolveAdminRefundRequest({
        refundRequestId: id,
        adminNotes: parsed.data.adminNotes,
      });
      return NextResponse.json(resolved);
    }

    const denied = await rejectAdminRefundRequest({
      refundRequestId: id,
      adminNotes: parsed.data.adminNotes,
    });
    return NextResponse.json(denied);
  } catch (error) {
    if (error instanceof AdminRefundActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError('Failed to update refund request from legacy admin route.', error, {
      tag: 'api/admin/refund-requests/[id]/PATCH',
      refundRequestId: id,
    });
    return NextResponse.json({ error: 'Unable to update the refund request right now.' }, { status: 500 });
  }
}
