import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import { buildTrackingUrl } from '@/lib/shipping';
import PrintLabelActions from './PrintLabelActions';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Print Shipping Label',
  robots: { index: false, follow: false },
};

type Params = {
  params: Promise<{ orderId: string }>;
};

export default async function SellerPrintLabelPage({ params }: Params) {
  const { sellerId } = await requireSeller();
  const { orderId } = await params;

  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      items: { some: { product: { sellerId } } },
    },
    select: {
      id: true,
      labelUrl: true,
      trackingNumber: true,
      carrier: true,
      shippingCarrier: true,
      shippingService: true,
      trackingUrl: true,
      shipments: {
        where: { sellerId },
        take: 1,
        select: {
          labelUrl: true,
          trackingNumber: true,
          carrier: true,
          shippingService: true,
          trackingUrl: true,
        },
      },
    },
  });

  if (!order) notFound();

  const sellerShipment = order.shipments[0];
  const labelUrl = sellerShipment?.labelUrl ?? order.labelUrl;
  const trackingNumber = sellerShipment?.trackingNumber ?? order.trackingNumber;
  const carrier = sellerShipment?.carrier ?? order.carrier ?? order.shippingCarrier;
  const shippingService = sellerShipment?.shippingService ?? order.shippingService;
  const trackingUrl = sellerShipment?.trackingUrl ?? order.trackingUrl ?? buildTrackingUrl(carrier, trackingNumber);

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6 print:max-w-none print:p-0">
      <style>{`@media print { @page { size: auto; margin: 10mm; } }`}</style>

      <div className="mb-4 print:hidden">
        <Link href="/seller?view=orders-to-ship" className="text-sm text-slate-500 hover:text-blue-600">
          ← Back to seller dashboard
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:shadow-none print:p-0">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4 print:pb-3">
          <div className="space-y-2">
            <Image
              src="/flupflap_logo_brand.png"
              alt="FlupFlap"
              width={168}
              height={44}
              priority
              className="h-auto w-[140px] md:w-[168px]"
            />
            <p className="text-xs text-slate-500">Branded print wrapper. Official carrier label is embedded below unchanged.</p>
          </div>
          <div className="space-y-2 text-right">
            <PrintLabelActions />
            {labelUrl && (
              <a href={labelUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm print:hidden">
                Open official label
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-2 py-4 text-sm text-slate-700 md:grid-cols-2 print:py-3">
          <p><span className="font-semibold">Order:</span> {order.id}</p>
          {carrier && <p><span className="font-semibold">Carrier:</span> {carrier}</p>}
          {shippingService && <p><span className="font-semibold">Service:</span> {shippingService}</p>}
          {trackingNumber && <p><span className="font-semibold">Tracking:</span> {trackingNumber}</p>}
          {trackingUrl && (
            <p className="md:col-span-2 print:hidden">
              <span className="font-semibold">Tracking link:</span>{' '}
              <a href={trackingUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700">
                {trackingUrl}
              </a>
            </p>
          )}
        </div>

        {labelUrl ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 print:border-0 print:rounded-none">
            <object data={labelUrl} type="application/pdf" className="h-[70vh] w-full print:h-[88vh]">
              <div className="space-y-3 p-4 text-sm text-slate-600 print:hidden">
                <p>Unable to embed this label in your browser.</p>
                <div className="flex flex-wrap gap-2">
                  <a href={labelUrl} target="_blank" rel="noreferrer" className="btn-outline text-sm">Open official label PDF</a>
                  <a href={`/api/seller/label-download?orderId=${encodeURIComponent(order.id)}`} target="_blank" rel="noreferrer" className="btn-outline text-sm">Download label PDF</a>
                </div>
              </div>
            </object>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 print:border-0 print:bg-white print:p-0">
            No purchased label is available for this order yet.
          </div>
        )}
      </section>
    </main>
  );
}
