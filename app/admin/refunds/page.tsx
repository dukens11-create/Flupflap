import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';
import { getAdminRefundRequestsSafe } from '@/lib/admin-refunds';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { refundRequests, fetchError, schemaIssue } = await getAdminRefundRequestsSafe();

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-4 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, approve or reject refunds, and keep refund outcomes organized without page crashes.
        </p>
      </div>

      <AdminRefundReviewList
        initialRefundRequests={refundRequests}
        loadError={fetchError}
        loadErrorMessage={schemaIssue
          ? 'Refund data is temporarily unavailable because the database schema is missing one or more refund tables or columns.'
          : 'We could not load live refund data right now. You can retry safely without leaving this page.'}
      />
    </main>
  );
}
