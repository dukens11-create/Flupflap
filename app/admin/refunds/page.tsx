import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { getRefundsForAdminDashboard } from '@/lib/admin-refunds';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { refunds, fetchFailed } = await getRefundsForAdminDashboard();

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, consider seller responses, and approve or deny final resolution.
        </p>
      </div>

      <AdminRefundReviewList initialRefundRequests={refunds} fetchFailed={fetchFailed} />
    </main>
  );
}
