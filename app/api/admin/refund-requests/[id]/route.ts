import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { approveRefundRequest, rejectRefundRequest } from '@/lib/admin-refunds';

const adminRefundSchema = z.object({
  action: z.enum(['approve', 'deny']),
  approvedAmountCents: z.number().int().positive().optional(),
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
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

    const result = parsed.data.action === 'deny'
      ? await rejectRefundRequest({
        id,
        adminNotes: parsed.data.adminNotes,
      })
      : await approveRefundRequest({
        id,
        adminUserId: session.user.id,
        approvedAmountCents: parsed.data.approvedAmountCents,
        adminNotes: parsed.data.adminNotes,
      });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    console.error('[api/admin/refund-requests] Unexpected error.', error);
    return NextResponse.json({ error: 'Failed to update refund request.' }, { status: 500 });
  }
}
