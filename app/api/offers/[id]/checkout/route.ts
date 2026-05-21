import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { validateOfferCheckoutAccess } from '@/lib/offer-checkout';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Please sign in to continue.' }, { status: 401 });
  }

  const { id } = await params;
  const offer = await prisma.offer.findUnique({
    where: { id },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          shippingCents: true,
          shippingMode: true,
          pickupAvailable: true,
          pickupCity: true,
          pickupState: true,
          status: true,
          inventory: true,
          sourceSupplierProduct: {
            select: {
              quantity: true,
              supplier: { select: { status: true } },
            },
          },
        },
      },
    },
  });

  const validated = validateOfferCheckoutAccess({
    offer: offer
      ? {
          buyerId: offer.buyerId,
          status: offer.status,
          respondedAt: offer.respondedAt,
          expiresAt: offer.expiresAt,
          convertedOrderId: offer.convertedOrderId,
        }
      : null,
    buyerId: session.user.id,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message }, { status: 400 });
  }

  const sourceSupplier = offer?.product?.sourceSupplierProduct;
  const supplierEligible = !sourceSupplier || (sourceSupplier.quantity > 0 && sourceSupplier.supplier.status === 'APPROVED');
  if (!offer?.product || !['APPROVED', 'ACTIVE'].includes(offer.product.status) || offer.product.inventory <= 0 || !supplierEligible) {
    return NextResponse.json(
      { error: 'This accepted offer can no longer be checked out because the listing is unavailable.' },
      { status: 400 },
    );
  }

  return NextResponse.json({
    offerId: offer.id,
    expiresAt: offer.expiresAt,
    item: {
      id: offer.product.id,
      title: offer.product.title,
      imageUrl: offer.product.imageUrl,
      priceCents: offer.amountCents,
      shippingCents: offer.product.shippingCents,
      shippingMode: offer.product.shippingMode,
      quantity: 1,
      pickupAvailable: offer.product.pickupAvailable,
      pickupCity: offer.product.pickupCity,
      pickupState: offer.product.pickupState,
    },
  });
}
