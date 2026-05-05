import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'User Management — Admin' };

function roleBadge(role: string) {
  const map: Record<string, string> = {
    CUSTOMER: 'badge-blue',
    SELLER: 'badge-green',
    ADMIN: 'badge-slate',
  };
  return map[role] ?? 'badge-slate';
}

function sellerStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

const PAGE_SIZE = 30;

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

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }
  if (roleFilter && ['CUSTOMER', 'SELLER', 'ADMIN'].includes(roleFilter)) {
    where.role = roleFilter;
  }

  const [users, total] = await Promise.all([
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
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

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

      {/* Search / filter */}
      <form method="GET" className="card p-4 mb-6 flex flex-wrap gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by name or email…"
          className="input flex-1 min-w-[180px]"
        />
        <select name="role" defaultValue={roleFilter} className="input w-40">
          <option value="">All roles</option>
          <option value="CUSTOMER">Buyer</option>
          <option value="SELLER">Seller</option>
          <option value="ADMIN">Admin</option>
        </select>
        <button type="submit" className="btn-primary">Search</button>
        {(q || roleFilter) && (
          <a href="/admin/users" className="btn-outline">Clear</a>
        )}
      </form>

      <p className="text-sm text-slate-500 mb-3">{total} user{total !== 1 ? 's' : ''} found</p>

      {users.length === 0 ? (
        <div className="card p-6 text-slate-500">No users match your search.</div>
      ) : (
        <div className="card overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left">
                <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Orders</th>
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
                  <td className="px-4 py-3">
                    <span className={`badge ${roleBadge(u.role)}`}>{u.role === 'CUSTOMER' ? 'Buyer' : u.role}</span>
                    {u.role === 'SELLER' && u.sellerStatus !== 'ACTIVE' && (
                      <span className={`badge ${sellerStatusBadge(u.sellerStatus)} ml-1`}>{u.sellerStatus}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-slate-600">
                    {u._count.orders}
                  </td>
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
              href={`/admin/users?q=${encodeURIComponent(q)}&role=${roleFilter}&page=${page - 1}`}
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
              href={`/admin/users?q=${encodeURIComponent(q)}&role=${roleFilter}&page=${page + 1}`}
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
