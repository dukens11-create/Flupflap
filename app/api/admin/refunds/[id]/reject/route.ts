import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';

const rejectSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

async function parseJsonBody(req: Request): Promise<unknown> {
  const raw = await req.text();
  if (!raw) return {};
  return JSON.parse(raw);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await parseJsonBody(req);
    const parsed = rejectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
    }

    const { id } = await params;
    const refundRequest = await prisma.refundRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        orderId: true,
        buyerId: true,
        adminNotes: true,
      },
    });

    if (!refundRequest) {
      return NextResponse.json({ success: false, error: 'Refund request not found.' }, { status: 404 });
    }

    if (refundRequest.status === 'REFUNDED') {
      return NextResponse.json({ success: false, error: 'Refund was already completed and cannot be rejected.' }, { status: 400 });
    }

    if (refundRequest.status === 'DENIED') {
      return NextResponse.json({ success: false, error: 'Refund request is already rejected.' }, { status: 400 });
    }

    const note = parsed.data.note ?? refundRequest.adminNotes ?? null;
    const updated = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        status: 'DENIED',
        adminNotes: note,
        resolvedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        approvedAmountCents: true,
        adminNotes: true,
        stripeRefundId: true,
        resolvedAt: true,
      },
    });

    await createNotifications([
      {
        userId: refundRequest.buyerId,
        type: NotificationType.ORDER_UPDATE,
        title: 'Refund request denied',
        body: 'Your refund request was denied after admin review.',
        link: `/orders/${refundRequest.orderId}`,
        data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: 'DENIED' },
      },
    ]);

    return NextResponse.json({
      success: true,
      refund: {
        ...updated,
        resolvedAt: updated.resolvedAt?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ success: false, error: 'Invalid JSON payload.' }, { status: 400 });
    }
    console.error('[api/admin/refunds/[id]/reject] Failed to reject refund', error);
    return NextResponse.json({ success: false, error: 'Failed to reject refund. Please try again.' }, { status: 500 });
  }
}
