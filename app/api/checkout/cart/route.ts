import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';
import { platformFee } from '@/lib/money';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to checkout.' }, { status: 401 });
    }

    const { items } = await req.json() as { items: { productId: string; quantity: number; isPickup?: boolean }[] };
    if (!items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });

    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map(i => i.productId) },
        status: 'APPROVED',
        inventory: { gt: 0 },
      },
    });

    if (!products.length) return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });

    const lineItems = products.map(p => {
      const cartItem = items.find(i => i.productId === p.id);
      const qty = cartItem?.quantity ?? 1;
      const isPickup = cartItem?.isPickup ?? false;
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: p.title, images: [p.imageUrl] },
          unit_amount: p.priceCents + (isPickup ? 0 : p.shippingCents),
        },
        quantity: qty,
      };
    });

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      metadata: {
        buyerId: session.user.id,
        items: JSON.stringify(items),
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error('[checkout/cart]', err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
