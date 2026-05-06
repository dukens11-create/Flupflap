/**
 * POST /api/products/[id]/report
 *
 * Authenticated users can submit a report on any product listing.
 *
 * Request body (JSON):
 *   reason  — required; one of the valid report reason keys
 *   notes   — optional; free-text additional details (max 2000 chars)
 *
 * Duplicate suppression: one open report per reporter/product/reason.
 * If an identical open report already exists, returns 409.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const VALID_REASONS = [
  'fake_counterfeit',
  'misleading_description',
  'misleading_photos',
  'prohibited_item',
  'scam_fraud',
  'item_unavailable',
  'other',
] as const;

const schema = z.object({
  reason: z.enum(VALID_REASONS),
  notes: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'You must be signed in to report a listing.' }, { status: 401 });
    }

    const { id: productId } = await params;

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sellerId: true, status: true },
    });

    if (!product || product.status === 'HIDDEN' || product.status === 'REJECTED') {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    // Sellers cannot report their own listings
    if (product.sellerId === session.user.id) {
      return NextResponse.json({ error: 'You cannot report your own listing.' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid report data.' }, { status: 400 });
    }
    const { reason, notes } = parsed.data;

    // Duplicate suppression: upsert — if an open report with the same
    // reporter/product/reason already exists, update the notes instead of creating
    // a duplicate. The @@unique([reporterId, productId, reason]) constraint
    // enforces this at the DB level too.
    try {
      await prisma.productReport.upsert({
        where: {
          reporterId_productId_reason: {
            reporterId: session.user.id,
            productId,
            reason,
          },
        },
        update: {
          notes: notes ?? null,
          status: 'OPEN',
          updatedAt: new Date(),
        },
        create: {
          productId,
          reporterId: session.user.id,
          sellerId: product.sellerId,
          reason,
          notes: notes ?? null,
        },
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        return NextResponse.json({ error: 'You have already reported this listing for this reason.' }, { status: 409 });
      }
      throw err;
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error('[products/[id]/report POST]', err);
    return NextResponse.json({ error: 'Failed to submit report.' }, { status: 500 });
  }
}
