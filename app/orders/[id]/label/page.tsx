import { notFound, redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getDeliveryStatusLabel } from '@/lib/shipping';
import PrintLabelButton from '@/components/PrintLabelButton';

export const metadata: Metadata = { title: 'Shipping Label' };

export default async function ShippingLabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');

  const { id } = await params;
  const order = await prisma.order.findFirst({
    where: {
      id,
      ...(session.user.role === 'ADMIN'
        ? {}
        : session.user.role === 'SELLER'
          ? { items: { some: { product: { sellerId: session.user.id } } } }
          : { buyerId: session.user.id }),
    },
    include: {
      buyer: { select: { name: true, email: true } },
      items: {
        include: {
          product: {
            select: {
              title: true,
              seller: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  if (!order || order.isPickup) notFound();

  const sellerNames = [...new Set(order.items.map((item) => item.product.seller.name))];
  const backHref = session.user.role === 'SELLER' ? '/seller' : `/orders/${order.id}`;

  return (
    <main className="max-w-3xl mx-auto print:max-w-none">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <Link href={backHref} className="text-sm text-slate-500 hover:text-blue-600">← Back</Link>
        <PrintLabelButton />
      </div>

      <section className="card p-8 border-2 border-dashed border-slate-300 print:border-slate-900">
        <div className="flex items-start justify-between gap-6 border-b pb-6 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500 mb-2">Shipping label</p>
            <h1 className="text-3xl font-black">Order #{order.id.slice(-8).toUpperCase()}</h1>
            <p className="text-sm text-slate-500 mt-2">
              Delivery status: {getDeliveryStatusLabel(order.deliveryStatus)}
            </p>
          </div>
          <div className="text-right text-sm text-slate-600">
            <p className="font-semibold">Carrier</p>
            <p>{order.shippingCarrier || 'To be assigned'}</p>
            <p className="font-semibold mt-3">Tracking</p>
            <p>{order.trackingNumber || 'Pending'}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Ship from</p>
            <div className="rounded-2xl border p-4">
              {sellerNames.map((name) => (
                <p key={name} className="font-semibold">{name}</p>
              ))}
              <p className="text-sm text-slate-500 mt-2">Seller shipment prepared in FlupFlap.</p>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Ship to</p>
            <div className="rounded-2xl border p-4 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">{order.shippingName || order.buyer.name}</p>
              {order.shippingLine1 && <p>{order.shippingLine1}</p>}
              {order.shippingLine2 && <p>{order.shippingLine2}</p>}
              <p>{[order.shippingCity, order.shippingState, order.shippingPostalCode].filter(Boolean).join(', ')}</p>
              {order.shippingCountry && <p>{order.shippingCountry}</p>}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Contents</p>
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span>{item.product.title}</span>
                <span>Qty {item.quantity}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-slate-500">
          First-release shipping labels in FlupFlap provide a printable shipment record for the seller and buyer.
          If you use a connected carrier service, keep the carrier-purchased postage label attached to the package.
        </p>
      </section>
    </main>
  );
}
