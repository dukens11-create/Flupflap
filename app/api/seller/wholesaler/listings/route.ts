import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  const isFormRequest = req.headers.get('content-type')?.includes('form') ?? false;
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER' || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let payload: { supplierProductId?: string; priceCents?: number; quantity?: number } = {};
  try {
    payload = await req.json();
  } catch {
    const form = await req.formData().catch(() => null);
    payload = {
      supplierProductId: typeof form?.get('supplierProductId') === 'string' ? String(form?.get('supplierProductId')) : undefined,
      priceCents: Number(form?.get('priceCents') ?? 0),
      quantity: Number(form?.get('quantity') ?? 0),
    };
  }

  const supplierProductId = payload?.supplierProductId?.trim();
  if (!supplierProductId) {
    return NextResponse.json({ error: 'supplierProductId is required.' }, { status: 400 });
  }

  const supplierProduct = await prisma.supplierProduct.findUnique({
    where: { id: supplierProductId },
    include: { supplier: true },
  });

  if (!supplierProduct) {
    return NextResponse.json({ error: 'Supplier product not found.' }, { status: 404 });
  }

  if (supplierProduct.supplier.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Wholesaler must be approved before listing products.' }, { status: 403 });
  }

  const quantity = Number.isFinite(payload?.quantity) && (payload?.quantity ?? 0) > 0
    ? Math.floor(payload?.quantity as number)
    : supplierProduct.quantity;

  const listing = await prisma.product.create({
    data: {
      title: supplierProduct.title,
      description: supplierProduct.description,
      condition: 'New',
      category: supplierProduct.category ?? 'Wholesaler',
      imageUrl: supplierProduct.images[0] ?? '',
      images: supplierProduct.images,
      originalImages: supplierProduct.images,
      mainImage: supplierProduct.images[0] ?? '',
      priceCents: Number.isFinite(payload?.priceCents) && (payload?.priceCents ?? 0) > 0 ? Math.floor(payload?.priceCents as number) : supplierProduct.retailPriceCents,
      shippingCents: 0,
      inventory: quantity,
      status: quantity > 0 ? 'APPROVED' : 'HIDDEN',
      sellerId: session.user.id,
      sourceSupplierProductId: supplierProduct.id,
      wholesalerSupplierId: supplierProduct.supplier.userId,
      weightOz: supplierProduct.shippingWeightOz,
      lengthIn: supplierProduct.dimensionLengthIn,
      widthIn: supplierProduct.dimensionWidthIn,
      heightIn: supplierProduct.dimensionHeightIn,
      productAttributes: {
        supplierSku: supplierProduct.sku,
        wholesalerSupplierId: supplierProduct.supplier.userId,
        brand: supplierProduct.brand,
      },
    },
    select: { id: true, status: true },
  });

  if (isFormRequest) {
    return NextResponse.redirect(new URL(`/seller/edit/${listing.id}?created=1`, req.url), 303);
  }

  return NextResponse.json({ success: true, listing });
}
