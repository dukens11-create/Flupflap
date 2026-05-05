import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { stripe, appUrl } from '@/lib/stripe';

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Please sign in to purchase.' }, { status: 401 });
    }

    const { productId, fulfillmentType = 'SHIPPING' } = await req.json() as {
      productId: string;
      fulfillmentType?: 'SHIPPING' | 'PICKUP';
    };

    const product = await prisma.product.findUnique({ where: { id: productId } });

    if (!product || product.status !== 'APPROVED' || product.inventory <= 0) {
      return NextResponse.json({ error: 'Product not available.' }, { status: 400 });
    }

    // Validate pickup eligibility
    if (fulfillmentType === 'PICKUP' && !product.pickupAvailable) {
      return NextResponse.json({ error: 'This item is not available for local pickup.' }, { status: 400 });
    }

    // For pickup orders, shipping cost is $0 (buyer picks up in person)
    const unitAmount = fulfillmentType === 'PICKUP'
      ? product.priceCents
      : product.priceCents + product.shippingCents;

    const stripeSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: product.title, images: [product.imageUrl] },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/products/${product.id}`,
      metadata: {
        buyerId: session.user.id,
        items: JSON.stringify([{ productId: product.id, quantity: 1 }]),
        fulfillmentType,
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error('[checkout/buynow]', err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
