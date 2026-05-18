import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { approveRefundRequest } from '@/lib/admin-refunds';

const approveSchema = z.object({
  approvedAmountCents: z.number().int().positive().optional(),
  adminNote: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    let body: unknown = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const parsed = approveSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
    }

    const result = await approveRefundRequest({
      id,
      adminUserId: session.user.id,
      approvedAmountCents: parsed.data.approvedAmountCents,
      adminNotes: parsed.data.adminNote,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, refund: result.data });
  } catch (error) {
    console.error('[api/admin/refunds/approve] Unexpected error.', error);
    return NextResponse.json({ error: 'Failed to approve refund request.' }, { status: 500 });
  }
}
