import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db';
import { requireSeller } from '@/lib/require-seller';
import SellerRefundReviewList from '@/components/SellerRefundReviewList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Seller Refund Requests' };

export default async function SellerRefundsPage() {
  const { sellerId } = await requireSeller();

  const refundRequests = await prisma.refundRequest.findMany({
    where: { sellerId },
    include: {
      order: {
        select: {
          id: true,
          status: true,
          totalCents: true,
          buyer: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const serializableRefundRequests = refundRequests.map((request) => ({
    ...request,
    createdAt: request.createdAt.toISOString(),
  }));

  return (
    <main className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link href="/seller" className="text-sm text-slate-500 hover:text-blue-600">← Back to seller dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer refund requests and provide your response for admin review.
        </p>
      </div>

      <SellerRefundReviewList initialRefundRequests={serializableRefundRequests} />
    </main>
  );
}
