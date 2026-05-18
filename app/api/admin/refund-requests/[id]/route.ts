import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { AdminRefundActionError, approveRefundRequest, rejectRefundRequest } from '@/lib/admin-refunds';

const adminRefundSchema = z.object({
  action: z.enum(['approve', 'deny']),
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
    const updated = parsed.data.action === 'deny'
      ? await rejectRefundRequest({
          id,
          adminNote: parsed.data.adminNotes,
        })
      : await approveRefundRequest({
          id,
          adminId: session.user.id,
          approvedAmountCents: parsed.data.approvedAmountCents,
          adminNote: parsed.data.adminNotes,
        });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AdminRefundActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error(`Failed to ${parsed.data.action} refund request ${id}:`, error);
    return NextResponse.json({ error: 'Unable to update refund request right now.' }, { status: 500 });
  }
}
