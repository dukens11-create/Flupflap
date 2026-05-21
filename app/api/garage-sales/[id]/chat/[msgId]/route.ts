import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; msgId: string }> };

/** DELETE /api/garage-sales/[id]/chat/[msgId] — seller hides a message (moderation) */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, msgId } = await params;

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Verify the caller owns the garage sale
  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { sellerId: true },
  });
  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (sale.sellerId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const msg = await prisma.garageSaleChat.findUnique({
    where: { id: msgId },
    select: { id: true, saleId: true },
  });
  if (!msg || msg.saleId !== id) {
    return NextResponse.json({ error: 'Message not found' }, { status: 404 });
  }

  await prisma.garageSaleChat.update({
    where: { id: msgId },
    data: { isHidden: true },
  });

  return NextResponse.json({ success: true });
}
