import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import AdminGarageSalesClient from './AdminGarageSalesClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin – Garage Sales' };

interface SearchParams {
  status?: string;
  page?: string;
}

export default async function AdminGarageSalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sp = await searchParams;
  const statusFilter = sp.status ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perPage = 50;

  const where: Record<string, unknown> = {};
  if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'HIDDEN'].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const [sales, total, pendingCount] = await Promise.all([
    prisma.garageSale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { reports: true, favorites: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.garageSale.count({ where }),
    prisma.garageSale.count({ where: { status: 'PENDING' } }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🏡 Garage Sales Admin</h1>
          <p className="text-sm text-slate-500 mt-1">{total} total · {pendingCount} pending review</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin Dashboard</Link>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: '' },
          { label: 'Pending', value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
          { label: 'Hidden', value: 'HIDDEN' },
          { label: 'Expired', value: 'EXPIRED' },
        ].map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/garage-sales?status=${tab.value}&page=1`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${statusFilter === tab.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
            {tab.value === 'PENDING' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{pendingCount}</span>
            )}
          </Link>
        ))}
      </div>

      <AdminGarageSalesClient
        sales={JSON.parse(JSON.stringify(sales))}
        total={total}
        page={page}
        totalPages={totalPages}
        statusFilter={statusFilter}
      />
    </div>
  );
}
