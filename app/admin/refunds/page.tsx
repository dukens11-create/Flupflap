import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { getAdminRefundRequests } from '@/lib/admin-refunds';
import AdminRefundReviewList from '@/components/AdminRefundReviewList';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  let session: Session | null = null;
  try {
    session = await getServerSession(authOptions);
  } catch (error) {
    console.error('[admin/refunds] Failed to load admin session.', error);
    return (
      <main className="mx-auto max-w-4xl py-12">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-slate-900">Unable to verify access</h1>
          <p className="mt-2 text-sm text-slate-600">
            Please refresh and try again.
          </p>
        </div>
      </main>
    );
  }

  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { refunds: refundRequests, loadError } = await getAdminRefundRequests();

  return (
    <main className="mx-auto max-w-5xl space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, consider seller responses, and approve or deny final resolution.
        </p>
      </div>

      <AdminRefundReviewList initialRefundRequests={refundRequests} initialLoadError={loadError} />
    </main>
  );
}
