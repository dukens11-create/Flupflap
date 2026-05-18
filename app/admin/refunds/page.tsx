import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import AdminRefundsDataLoader from '@/components/AdminRefundsDataLoader';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Admin Refund Requests' };

export default async function AdminRefundsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <div className="card p-8 text-center">
          <p className="text-4xl" aria-hidden="true">🔒</p>
          <h1 className="mt-3 text-2xl font-black text-slate-900">Admin access required.</h1>
          <p className="mt-2 text-sm text-slate-500">
            You must be an administrator to review refund requests.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="btn-outline">Go home</Link>
            <Link href="/admin" className="btn-primary">← Back to admin dashboard</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
      <div>
        <Link href="/admin" className="text-sm text-slate-500 hover:text-blue-600">← Back to admin dashboard</Link>
        <h1 className="mt-2 text-3xl font-black">Marketplace Refund Requests</h1>
        <p className="text-sm text-slate-500">
          Review buyer requests, issue refunds, and track the latest refund activity without leaving the admin dashboard.
        </p>
      </div>

      <AdminRefundsDataLoader />
    </main>
  );
}
