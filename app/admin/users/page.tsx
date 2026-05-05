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

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; role?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sp = await searchParams;
  const query = sp.q?.trim() ?? '';
  const roleFilter = sp.role as 'CUSTOMER' | 'SELLER' | 'ADMIN' | undefined;

  const users = await prisma.user.findMany({
    where: {
      ...(query && {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { email: { contains: query, mode: 'insensitive' } },
        ],
      }),
      ...(roleFilter && { role: roleFilter }),
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      sellerStatus: true,
      createdAt: true,
      _count: { select: { orders: true, products: true } },
    },
  });

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">User Management</h1>
          <p className="text-slate-500 text-sm">
            View buyer and seller accounts for support and issue resolution.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
      </div>

      {/* Search + filter */}
      <form method="GET" className="card p-4 mb-6 flex gap-3 flex-wrap">
        <input
          name="q"
          defaultValue={query}
          className="input flex-1 min-w-[200px]"
          placeholder="Search by name or email…"
        />
        <select name="role" defaultValue={roleFilter ?? ''} className="input w-36">
          <option value="">All roles</option>
          <option value="CUSTOMER">Buyers</option>
          <option value="SELLER">Sellers</option>
          <option value="ADMIN">Admins</option>
        </select>
        <button type="submit" className="btn-primary">Search</button>
        {(query || roleFilter) && (
          <a href="/admin/users" className="btn-outline">Clear</a>
        )}
      </form>

      {users.length === 0 ? (
        <div className="card p-6 text-slate-500">No users found.</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left bg-slate-50">
                <th className="px-4 py-3 font-semibold text-slate-600">Name</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Email</th>
                <th className="px-4 py-3 font-semibold text-slate-600">Role</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Joined</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Orders</th>
                <th className="px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Listings</th>
                <th className="px-4 py-3 font-semibold text-slate-600"></th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">
                    {u.name}
                    {u.role === 'SELLER' && u.sellerStatus !== 'ACTIVE' && (
                      <span className={`ml-2 badge ${sellerStatusBadge(u.sellerStatus)}`}>
                        {u.sellerStatus}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`badge ${roleBadge(u.role)}`}>{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500 hidden md:table-cell text-xs">
                    {u.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-slate-700 hidden lg:table-cell">{u._count.orders}</td>
                  <td className="px-4 py-3 text-slate-700 hidden lg:table-cell">{u._count.products}</td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/users/${u.id}`} className="btn-outline text-xs py-1 px-2">
                      View →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.length === 50 && (
            <p className="px-4 py-3 text-xs text-slate-400 border-t">Showing first 50 results. Use search to narrow down.</p>
          )}
        </div>
      )}
    </main>
  );
}
