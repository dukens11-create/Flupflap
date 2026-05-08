import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const VALID_SELLER_REPORT_REASONS = [
  'scam_fraud',
  'off_platform_payment',
  'counterfeit_behavior',
  'non_delivery',
  'abusive_behavior',
  'other',
] as const;

const schema = z.object({
  reason: z.enum(VALID_SELLER_REPORT_REASONS),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'You must be signed in to report a seller.' }, { status: 401 });
    }

    const { id: sellerId } = await params;
    const seller = await prisma.user.findUnique({
      where: { id: sellerId },
      select: { id: true, role: true },
    });

    if (!seller || seller.role !== 'SELLER') {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }

    if (seller.id === session.user.id) {
      return NextResponse.json({ error: 'You cannot report your own seller account.' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid report data.' }, { status: 400 });
    }

    const { reason, notes } = parsed.data;

    await prisma.sellerReport.upsert({
      where: {
        reporterId_sellerId_reason: {
          reporterId: session.user.id,
          sellerId,
          reason,
        },
      },
      update: {
        notes: notes ?? null,
        status: 'OPEN',
        adminId: null,
        adminAction: null,
        adminNotes: null,
        resolvedAt: null,
      },
      create: {
        sellerId,
        reporterId: session.user.id,
        reason,
        notes: notes ?? null,
      },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error('[sellers/[id]/report POST]', error);
    return NextResponse.json({ error: 'Failed to submit report.' }, { status: 500 });
  }
}
