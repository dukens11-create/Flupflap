import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sessionHasRole } from '@/lib/user-roles';

const sellerRefundSchema = z.object({
  action: z.enum(['accept', 'dispute']),
  sellerResponse: z.string().trim().max(2000).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!sessionHasRole(session.user, 'SELLER')) {
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

  const prefix = parsed.data.action === 'accept' ? 'Seller accepted request' : 'Seller disputed request';
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
