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

    const body = await req.json() as {
      items: { productId: string; quantity: number }[];
      pickupItemIds?: string[];
    };
    const { items, pickupItemIds = [] } = body;
    if (!items?.length) return NextResponse.json({ error: 'Cart is empty.' }, { status: 400 });

    const pickupSet = new Set(pickupItemIds);

    const products = await prisma.product.findMany({
      where: {
        id: { in: items.map(i => i.productId) },
        status: 'APPROVED',
        inventory: { gt: 0 },
      },
    });

    if (!products.length) return NextResponse.json({ error: 'No valid products in cart.' }, { status: 400 });

    const lineItems = products.map(p => {
      const qty = items.find(i => i.productId === p.id)?.quantity ?? 1;
      const isPickup = pickupSet.has(p.id);
      // For pickup orders, only charge item price (no shipping fee)
      const unitAmount = isPickup ? p.priceCents : p.priceCents + p.shippingCents;
      return {
        price_data: {
          currency: 'usd',
          product_data: { name: p.title, images: [p.imageUrl] },
          unit_amount: unitAmount,
        },
        quantity: qty,
      };
    });

    // If ALL items are pickup, don't collect a shipping address from Stripe
    const allPickup = products.every(p => pickupSet.has(p.id));

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/checkout/cancel`,
      ...(allPickup
        ? {}
        : {
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
          }),
      metadata: {
        buyerId: session.user.id,
        items: JSON.stringify(items),
        pickupItemIds: JSON.stringify(pickupItemIds),
        isPickup: allPickup ? 'true' : 'false',
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error('[checkout/cart]', err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
