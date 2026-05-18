import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';
import { getAdminRefundRequests } from '@/lib/admin-refunds';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const refundRequests = await getAdminRefundRequests();

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, consider seller responses, and approve or close refund cases safely.
        </p>
      </div>

      <AdminRefundReviewList initialRefundRequests={refundRequests} />
    </main>
  );
}
