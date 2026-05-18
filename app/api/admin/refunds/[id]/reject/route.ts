import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { AdminRefundActionError, rejectAdminRefundRequest } from '@/lib/admin-refunds';
import { logError } from '@/lib/logger';

const rejectRefundSchema = z.object({
  adminNotes: z.string().trim().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
    const payload = await req.text();
    body = payload ? JSON.parse(payload) : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const parsed = rejectRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

  try {
    const rejected = await rejectAdminRefundRequest({
      refundRequestId: id,
      adminNotes: parsed.data.adminNotes,
    });
    return NextResponse.json(rejected);
  } catch (error) {
    if (error instanceof AdminRefundActionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    logError('Failed to reject admin refund request.', error, {
      tag: 'api/admin/refunds/[id]/reject/POST',
      refundRequestId: id,
    });
    return NextResponse.json({ error: 'Unable to reject this refund right now.' }, { status: 500 });
  }
}
