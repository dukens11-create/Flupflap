import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    select: { id: true, sellerId: true, status: true },
  });

  if (!product) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }

  // Only count views on approved products; return silently for others
  if (product.status !== 'APPROVED') {
    return NextResponse.json({ ok: false, skipped: true });
  }

  // Skip counting views from the seller or admin
  const session = await getServerSession(authOptions);
  if (session?.user) {
    if (
      session.user.id === product.sellerId ||
      session.user.role === 'ADMIN'
    ) {
      return NextResponse.json({ ok: false, skipped: true });
    }
  }

  await prisma.product.update({
    where: { id },
    data: {
      viewCount: { increment: 1 },
      lastViewedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true });
}
