import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isSellerVerificationApproved } from '@/lib/seller-verification';
import { sessionHasRole } from '@/lib/user-roles';

/**
 * PATCH /api/seller/products/[id]/inventory
 * Updates only the inventory quantity of a listing without triggering re-approval.
 * This allows sellers to restock or adjust quantities at any time.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !sessionHasRole(session.user, 'SELLER')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const dbUser = await prisma.user.findUnique({ where: { id: sellerId } });
    if (dbUser?.sellerStatus === 'SUSPENDED' || dbUser?.sellerStatus === 'BANNED' || dbUser?.sellerStatus === 'RESTRICTED') {
      return NextResponse.json({ error: 'Your seller account is currently restricted.' }, { status: 403 });
    }

    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: { status: true },
    });
    if (!isSellerVerificationApproved(verification?.status)) {
      return NextResponse.json(
        { error: 'Submit and pass seller verification before managing listings.' },
        { status: 403 },
      );
    }

    const { id } = await params;
    const existing = await prisma.product.findUnique({ where: { id } });
    if (existing && existing.sellerId !== sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Product not found.' }, { status: 404 });
    }

    const body = await req.json() as { inventory: unknown };
    const inventory = Number(body.inventory);
    if (
      !Number.isInteger(inventory) ||
      inventory < 0 ||
      inventory > 9999
    ) {
      return NextResponse.json({ error: 'Inventory must be an integer between 0 and 9999.' }, { status: 400 });
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { inventory },
      select: { id: true, inventory: true, status: true },
    });

    return NextResponse.json({ ok: true, inventory: updated.inventory, status: updated.status });
  } catch (err: any) {
    console.error('[seller/products/[id]/inventory PATCH]', err);
    return NextResponse.json({ error: 'Failed to update inventory.' }, { status: 500 });
  }
}
