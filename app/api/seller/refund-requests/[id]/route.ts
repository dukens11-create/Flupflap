import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const sellerRefundSchema = z.object({
  action: z.enum(['approve', 'reject', 'message', 'accept', 'dispute']),
  sellerResponse: z.string().trim().max(2000).optional(),
});
const ACTION_ALIAS: Record<z.infer<typeof sellerRefundSchema>['action'], 'approve' | 'reject' | 'message'> = {
  approve: 'approve',
  reject: 'reject',
  message: 'message',
  accept: 'approve',
  dispute: 'reject',
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Seller account required.' }, { status: 403 });
  }

  const { id } = await params;

  const refundRequest = await prisma.refundRequest.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      sellerId: true,
      orderId: true,
    },
  });

  if (!refundRequest) {
    return NextResponse.json({ error: 'Refund request not found.' }, { status: 404 });
  }

  if (refundRequest.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (['DENIED', 'REFUNDED'].includes(refundRequest.status)) {
    return NextResponse.json({ error: 'This refund request is already resolved.' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  const parsed = sellerRefundSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid payload.' }, { status: 422 });
  }

  const normalizedAction = ACTION_ALIAS[parsed.data.action];
  const prefix = normalizedAction === 'approve'
    ? 'Seller approved request'
    : normalizedAction === 'reject'
      ? 'Seller rejected request'
      : 'Seller message';
  const sellerResponse = parsed.data.sellerResponse
    ? `${prefix}: ${parsed.data.sellerResponse}`
    : `${prefix}.`;

  const updated = await prisma.refundRequest.update({
    where: { id: refundRequest.id },
    data: {
      status: 'SELLER_REVIEW',
      sellerResponse,
    },
  });

  return NextResponse.json(updated);
}
