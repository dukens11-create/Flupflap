import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const schema = z.object({
  action: z.enum(['approve_refund', 'needs_admin_review']),
  sellerResponse: z.string().min(10).max(2000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const form = await req.formData();
    const data = schema.parse({
      action: form.get('action'),
      sellerResponse: form.get('sellerResponse'),
    });

    const dispute = await prisma.orderItemDispute.findFirst({
      where: {
        id,
        sellerId: session.user.id,
      },
    });

    if (!dispute) {
      return NextResponse.redirect(new URL('/disputes?update=not-found', req.url));
    }

    await prisma.orderItemDispute.update({
      where: { id },
      data: {
        sellerResponse: data.sellerResponse,
        sellerRespondedAt: new Date(),
        status: data.action === 'approve_refund' ? 'RESOLVED' : 'UNDER_REVIEW',
        refundStatus: data.action === 'approve_refund' ? 'APPROVED' : dispute.refundStatus,
        resolvedAt: data.action === 'approve_refund' ? new Date() : null,
      },
    });

    return NextResponse.redirect(new URL('/disputes?update=success', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.redirect(new URL('/disputes?update=invalid', req.url));
    }
    console.error('[disputes/[id]/seller POST]', err);
    return NextResponse.redirect(new URL('/disputes?update=error', req.url));
  }
}
