import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { sessionHasRole } from '@/lib/user-roles';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || !sessionHasRole(session.user, 'SELLER')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    if (!orderId) {
      return NextResponse.json({ error: 'Order ID required.' }, { status: 400 });
    }

    // Verify the order belongs to this seller and has a label
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        items: { some: { product: { sellerId } } },
      },
      select: { labelUrl: true },
    });

    if (!order?.labelUrl) {
      return NextResponse.json({ error: 'Label not found.' }, { status: 404 });
    }

    const res = await fetch(order.labelUrl);
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch label.' }, { status: 502 });
    }

    const blob = await res.arrayBuffer();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="shipping-label-${orderId}.pdf"`,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to download label.';
    console.error('[label-download]', err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
