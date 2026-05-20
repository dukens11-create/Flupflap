import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { approveAdminRefund } from '@/lib/admin-refunds';
import { sessionHasRole } from '@/lib/user-roles';

const approveRefundSchema = z.object({
  adminNote: z.string().trim().max(2000).optional(),
  approvedAmountCents: z.number().int().positive().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!sessionHasRole(session.user, 'ADMIN')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = approveRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

  const { id } = await params;
  const result = await approveAdminRefund({
    refundId: id,
    adminUserId: session.user.id,
    adminNote: parsed.data.adminNote,
    approvedAmountCents: parsed.data.approvedAmountCents,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ refund: result.refund });
}
