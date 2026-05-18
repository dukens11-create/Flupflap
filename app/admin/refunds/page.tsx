import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  let refundRequests: Array<{
    id: string;
    status: 'REQUESTED' | 'SELLER_REVIEW' | 'APPROVED' | 'DENIED' | 'REFUNDED';
    reason: string;
    details: string | null;
    requestedAmountCents: number;
    approvedAmountCents: number | null;
    adminNotes: string | null;
    sellerResponse: string | null;
    stripeRefundId: string | null;
    createdAt: string;
    order: {
      id: string;
      status: string;
      totalCents: number;
      stripePaymentIntentId: string | null;
    };
    buyer: { id: string; name: string | null; email: string };
    seller: { id: string; name: string | null; email: string };
  }> = [];
  let refundFetchError = false;

  try {
    const records = await prisma.refundRequest.findMany({
      include: {
        order: {
          select: {
            id: true,
            status: true,
            totalCents: true,
            stripePaymentIntentId: true,
          },
        },
        buyer: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    refundRequests = records.map((request) => ({
      ...request,
      createdAt: request.createdAt.toISOString(),
    }));
  } catch (error) {
    refundFetchError = true;
    refundRequests = [];
    console.error('[admin/refunds] Failed to fetch refund requests', error);
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, consider seller responses, and approve or deny final resolution.
        </p>
      </div>

      <AdminRefundReviewList initialRefundRequests={refundRequests} refundFetchError={refundFetchError} />
    </main>
  );
}
