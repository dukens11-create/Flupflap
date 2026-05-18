import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { NotificationType } from '@prisma/client';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { createNotifications } from '@/lib/notifications';

const resolveSchema = z.object({
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
    const parsed = resolveSchema.safeParse(body);
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
        approvedAmountCents: true,
        adminNotes: true,
        stripeRefundId: true,
        resolvedAt: true,
      },
    });

    if (!refundRequest) {
      return NextResponse.json({ success: false, error: 'Refund request not found.' }, { status: 404 });
    }

    const mergedNote = parsed.data.note ?? refundRequest.adminNotes ?? null;
    const updated = await prisma.refundRequest.update({
      where: { id: refundRequest.id },
      data: {
        adminNotes: mergedNote,
        resolvedAt: refundRequest.resolvedAt ?? new Date(),
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
        title: 'Refund request updated',
        body: 'Your refund request has been reviewed by support.',
        link: `/orders/${refundRequest.orderId}`,
        data: { orderId: refundRequest.orderId, refundRequestId: refundRequest.id, status: updated.status },
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
    console.error('[api/admin/refunds/[id]/resolve] Failed to resolve refund', error);
    return NextResponse.json({ success: false, error: 'Failed to resolve refund. Please try again.' }, { status: 500 });
  }
}
