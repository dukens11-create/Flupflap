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

    const { productId, isPickup = false } = await req.json() as { productId: string; isPickup?: boolean };
    const product = await prisma.product.findUnique({ where: { id: productId } });

    if (!product || product.status !== 'APPROVED' || product.inventory <= 0) {
      return NextResponse.json({ error: 'Product not available.' }, { status: 400 });
    }

    // Validate pickup is actually available if requested
    const actualPickup = isPickup && product.pickupAvailable;

    // For pickup orders, only charge item price (no shipping)
    const unitAmount = actualPickup ? product.priceCents : product.priceCents + product.shippingCents;

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
      // Don't collect shipping address for pure pickup orders
      ...(actualPickup
        ? {}
        : {
            shipping_address_collection: { allowed_countries: ['US', 'CA', 'GB', 'AU'] },
          }),
      metadata: {
        buyerId: session.user.id,
        items: JSON.stringify([{ productId: product.id, quantity: 1 }]),
        pickupItemIds: actualPickup ? JSON.stringify([product.id]) : JSON.stringify([]),
        isPickup: actualPickup ? 'true' : 'false',
      },
    });

    return NextResponse.json({ url: stripeSession.url });
  } catch (err: any) {
    console.error('[checkout/buynow]', err);
    return NextResponse.json({ error: 'Checkout failed.' }, { status: 500 });
  }
}
