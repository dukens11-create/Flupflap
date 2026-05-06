import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'User Management — Admin' };

function sellerStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

const PAGE_SIZE = 30;

const TABS = [
  { label: 'All Users', role: '' },
  { label: '🛒 Buyers', role: 'CUSTOMER' },
  { label: '🏪 Sellers', role: 'SELLER' },
] as const;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string; page?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sp = await searchParams;
  const q = sp.q ?? '';
  const roleFilter = sp.role ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));

  // Only allow tab-driven role filters (not ADMIN via URL manipulation for this view)
  const activeRole = ['CUSTOMER', 'SELLER', ''].includes(roleFilter) ? roleFilter : '';

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (activeRole) {
    where.role = activeRole;
  } else {
    // Exclude ADMIN accounts from this view
    where.role = { in: ['CUSTOMER', 'SELLER'] };
  }

  const [users, total, buyerCount, sellerCount] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        phoneVerified: true,
        sellerStatus: true,
        createdAt: true,
        _count: { select: { products: true, orders: true } },
      },
    }),
    prisma.user.count({ where }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.user.count({ where: { role: 'SELLER' } }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const isBuyerTab = activeRole === 'CUSTOMER';
  const isSellerTab = activeRole === 'SELLER';

  function tabHref(role: string) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (role) params.set('role', role);
    return `/admin/users${params.size ? `?${params}` : ''}`;
  }

  function tabClass(role: string) {
    const active = role === activeRole;
    return active
      ? 'px-4 py-2 text-sm font-semibold rounded-t-xl border border-b-0 border-slate-200 bg-white text-blue-600'
      : 'px-4 py-2 text-sm font-semibold rounded-t-xl text-slate-500 hover:text-slate-800 border border-transparent';
  }

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">User Management</h1>
          <p className="text-slate-500 text-sm">
            View and manage buyer and seller accounts.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <a href={tabHref('CUSTOMER')} className={`card p-4 text-center hover:bg-slate-50 transition-colors ${isBuyerTab ? 'border-blue-300 ring-2 ring-blue-100' : ''}`}>
          <p className="text-3xl font-black text-blue-600">{buyerCount}</p>
          <p className="text-sm text-slate-500">🛒 Buyer{buyerCount !== 1 ? 's' : ''}</p>
        </a>
        <a href={tabHref('SELLER')} className={`card p-4 text-center hover:bg-slate-50 transition-colors ${isSellerTab ? 'border-green-300 ring-2 ring-green-100' : ''}`}>
          <p className="text-3xl font-black text-green-600">{sellerCount}</p>
          <p className="text-sm text-slate-500">🏪 Seller{sellerCount !== 1 ? 's' : ''}</p>
        </a>
      </div>

      {/* Tab navigation */}
      <div className="flex gap-1 border-b border-slate-200 mb-0">
        {TABS.map(tab => (
          <a key={tab.role} href={tabHref(tab.role)} className={tabClass(tab.role)}>
            {tab.label}
            {tab.role === 'CUSTOMER' && <span className="ml-1 text-xs text-slate-400">({buyerCount})</span>}
            {tab.role === 'SELLER' && <span className="ml-1 text-xs text-slate-400">({sellerCount})</span>}
          </a>
        ))}
      </div>

      {/* Search */}
      <form method="GET" className="card rounded-t-none border-t-0 p-4 mb-6 flex flex-wrap gap-3">
        {activeRole && <input type="hidden" name="role" value={activeRole} />}
        <input
          name="q"
          defaultValue={q}
          placeholder={isBuyerTab ? 'Search buyers by name or email…' : isSellerTab ? 'Search sellers by name or email…' : 'Search by name or email…'}
          className="input flex-1 min-w-[180px]"
        />
        <button type="submit" className="btn-primary">Search</button>
        {q && (
          <a href={tabHref(activeRole)} className="btn-outline">Clear</a>
        )}
      </form>

      <p className="text-sm text-slate-500 mb-3">{total} {isBuyerTab ? 'buyer' : isSellerTab ? 'seller' : 'user'}{total !== 1 ? 's' : ''} found</p>

      {users.length === 0 ? (
        <div className="card p-6 text-slate-500">No {isBuyerTab ? 'buyers' : isSellerTab ? 'sellers' : 'users'} match your search.</div>
      ) : (
        <div className="card overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Email</th>
                {!isSellerTab && (
                  <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                )}
                {isSellerTab && (
                  <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Status</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Orders</th>
                {isSellerTab && (
                  <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Listings</th>
                )}
                <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Joined</th>
                <th className="px-4 py-3 font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{u.name}</p>
                    <p className="text-xs text-slate-400 md:hidden">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{u.email}</td>
                  {!isSellerTab && (
                    <td className="px-4 py-3">
                      <span className={`badge ${u.role === 'CUSTOMER' ? 'badge-blue' : u.role === 'SELLER' ? 'badge-green' : 'badge-slate'}`}>
                        {u.role === 'CUSTOMER' ? 'Buyer' : u.role}
                      </span>
                    </td>
                  )}
                  {isSellerTab && (
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={`badge ${sellerStatusBadge(u.sellerStatus ?? 'ACTIVE')}`}>
                        {u.sellerStatus ?? 'ACTIVE'}
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600">
                    {u._count.orders}
                  </td>
                  {isSellerTab && (
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-600">
                      {u._count.products}
                    </td>
                  )}
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs">
                    {u.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/users/${u.id}`} className="btn-outline text-xs py-1 px-2">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex gap-2 justify-center">
          {page > 1 && (
            <Link
              href={`/admin/users?q=${encodeURIComponent(q)}&role=${activeRole}&page=${page - 1}`}
              className="btn-outline text-sm"
            >
              ← Previous
            </Link>
          )}
          <span className="text-sm text-slate-500 self-center">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/users?q=${encodeURIComponent(q)}&role=${activeRole}&page=${page + 1}`}
              className="btn-outline text-sm"
            >
              Next →
            </Link>
          )}
        </div>
      )}
    </main>
  );
}
