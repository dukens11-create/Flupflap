import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { z } from 'zod';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

const schema = z.object({
  action: z.enum(['approve_refund', 'decline_refund']),
  adminNotes: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const form = await req.formData();
    const data = schema.parse({
      action: form.get('action'),
      adminNotes: form.get('adminNotes')?.toString().trim() || undefined,
    });

    const dispute = await prisma.orderItemDispute.findUnique({ where: { id } });
    if (!dispute) {
      return NextResponse.redirect(new URL('/admin/disputes?update=not-found', req.url));
    }

    await prisma.orderItemDispute.update({
      where: { id },
      data: {
        status: 'RESOLVED',
        refundStatus: data.action === 'approve_refund' ? 'APPROVED' : 'DECLINED',
        adminId: session.user.id,
        adminDecision: data.action,
        adminNotes: data.adminNotes,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.redirect(new URL('/admin/disputes?update=success', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      return NextResponse.redirect(new URL('/admin/disputes?update=invalid', req.url));
    }
    console.error('[admin/disputes/[id]/resolve POST]', err);
    return NextResponse.redirect(new URL('/admin/disputes?update=error', req.url));
  }
}
