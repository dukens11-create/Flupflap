import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { AdminRefundActionError, approveRefundRequest } from '@/lib/admin-refunds';

const approveRefundSchema = z.object({
  approvedAmountCents: z.number().int().positive().optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown = {};
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

  try {
    const updated = await approveRefundRequest({
      id,
      adminId: session.user.id,
      approvedAmountCents: parsed.data.approvedAmountCents,
      adminNotes: parsed.data.adminNote,
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof AdminRefundActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error(`Failed to approve refund ${id}:`, error);
    return NextResponse.json({ error: 'Unable to approve refund right now.' }, { status: 500 });
  }
}
