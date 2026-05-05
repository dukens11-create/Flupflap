import { redirect, notFound } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import Link from 'next/link';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'User Detail — Admin' };

const REASON_LABELS: Record<string, string> = {
  misconduct_to_customer: 'Misconduct to customer',
  fake_product: 'Fake product',
  unlawful_activity: 'Unlawful activity',
  fraud: 'Fraud',
  spam: 'Spam',
  policy_violation: 'Policy violation',
  other: 'Other',
};

function orderStatusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
    CANCELLED: 'badge-red',
    REFUNDED: 'badge-slate',
    READY_FOR_PICKUP: 'badge-blue',
    PICKED_UP: 'badge-green',
  };
  return map[status] ?? 'badge-slate';
}

function productStatusBadge(status: string) {
  const map: Record<string, string> = {
    PENDING: 'badge-yellow',
    APPROVED: 'badge-green',
    REJECTED: 'badge-red',
    SOLD: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phone: true,
      phoneVerified: true,
      phoneVerifiedAt: true,
      sellerStatus: true,
      sellerStatusReason: true,
      sellerStatusNotes: true,
      stripeAccountId: true,
      stripeOnboardingComplete: true,
      createdAt: true,
      // password deliberately excluded
    },
  });

  if (!user) notFound();

  const [orders, products, moderationLogs] = await Promise.all([
    prisma.order.findMany({
      where:
        user.role === 'SELLER'
          ? { items: { some: { product: { sellerId: id } } } }
          : { buyerId: id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: {
        items: {
          include: { product: { select: { title: true } } },
        },
        buyer: { select: { name: true, email: true } },
      },
    }),
    user.role === 'SELLER'
      ? prisma.product.findMany({
          where: { sellerId: id },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, title: true, status: true, priceCents: true, createdAt: true },
        })
      : Promise.resolve([]),
    user.role === 'SELLER'
      ? prisma.sellerModerationLog.findMany({
          where: { sellerId: id },
          orderBy: { createdAt: 'desc' },
          include: { admin: { select: { name: true, email: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Log admin access for audit trail
  await prisma.adminAccessLog.create({
    data: {
      adminId: session.user.id,
      targetId: id,
      action: 'view_account',
    },
  });

  return (
    <main className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href="/admin/users" className="text-sm text-slate-500 hover:text-blue-600">← User Management</Link>
          <h1 className="text-2xl font-black mt-1">{user.name}</h1>
          <p className="text-slate-500 text-sm">{user.email}</p>
        </div>
        <div className="text-right">
          <span className={`badge ${user.role === 'SELLER' ? 'badge-green' : user.role === 'ADMIN' ? 'badge-slate' : 'badge-blue'}`}>
            {user.role === 'CUSTOMER' ? 'Buyer' : user.role}
          </span>
          <p className="text-xs text-slate-400 mt-1">
            Joined {user.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Admin support banner */}
      <div className="card p-3 mb-6 bg-amber-50 border-amber-200 text-amber-800 text-xs flex items-center gap-2">
        <span className="font-semibold">🔒 Admin Support View</span>
        <span>You are viewing this account as admin support. This access is logged.</span>
      </div>

      {/* Account details */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">Account Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="label">Name</p>
            <p>{user.name}</p>
          </div>
          <div>
            <p className="label">Email</p>
            <p>{user.email}</p>
          </div>
          <div>
            <p className="label">Phone</p>
            <p>{user.phone ?? <span className="text-slate-400">Not set</span>}</p>
            {user.phone && (
              <span className={`badge text-xs mt-0.5 ${user.phoneVerified ? 'badge-green' : 'badge-yellow'}`}>
                {user.phoneVerified ? 'Verified' : 'Unverified'}
              </span>
            )}
          </div>
          <div>
            <p className="label">Role</p>
            <p className="capitalize">{user.role.toLowerCase()}</p>
          </div>
          {user.role === 'SELLER' && (
            <>
              <div>
                <p className="label">Seller Status</p>
                <span className={`badge ${user.sellerStatus === 'ACTIVE' ? 'badge-green' : user.sellerStatus === 'SUSPENDED' ? 'badge-yellow' : 'badge-red'}`}>
                  {user.sellerStatus}
                </span>
                {user.sellerStatusReason && user.sellerStatus !== 'ACTIVE' && (
                  <p className="text-xs text-slate-600 mt-1">
                    {REASON_LABELS[user.sellerStatusReason] ?? user.sellerStatusReason}
                    {user.sellerStatusNotes && ` — ${user.sellerStatusNotes}`}
                  </p>
                )}
              </div>
              <div>
                <p className="label">Stripe Payouts</p>
                <p>{user.stripeOnboardingComplete ? (
                  <span className="badge badge-green">Connected</span>
                ) : (
                  <span className="badge badge-yellow">Not connected</span>
                )}</p>
              </div>
            </>
          )}
        </div>

        {user.role === 'SELLER' && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link href={`/admin/sellers`} className="btn-outline text-sm">
              Seller Moderation →
            </Link>
          </div>
        )}
      </div>

      {/* Orders */}
      <div className="card p-6 mb-6">
        <h2 className="text-lg font-bold mb-4">
          {user.role === 'SELLER' ? 'Orders (seller)' : 'Orders'} ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="text-slate-500 text-sm">No orders.</p>
        ) : (
          <div className="space-y-3">
            {orders.map(o => (
              <div key={o.id} className="border border-slate-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-slate-400">#{o.id.slice(-8).toUpperCase()}</span>
                  <span className={`badge ${orderStatusBadge(o.status)}`}>{o.status.replace('_', ' ')}</span>
                </div>
                <p className="text-sm text-slate-600">
                  {o.items.map(i => i.product.title).join(', ')}
                </p>
                <div className="flex justify-between mt-1">
                  <p className="text-xs text-slate-400">
                    {o.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {o.isPickup && <span className="ml-2 badge badge-slate">Pickup</span>}
                  </p>
                  <p className="text-sm font-semibold">{dollars(o.totalCents)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Products (sellers only) */}
      {user.role === 'SELLER' && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">Listings ({products.length})</h2>
          {products.length === 0 ? (
            <p className="text-slate-500 text-sm">No listings.</p>
          ) : (
            <div className="space-y-2">
              {(products as Array<{ id: string; title: string; status: string; priceCents: number; createdAt: Date }>).map(p => (
                <div key={p.id} className="border border-slate-100 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{p.title}</p>
                    <p className="text-xs text-slate-400">{dollars(p.priceCents)}</p>
                  </div>
                  <span className={`badge ${productStatusBadge(p.status)}`}>{p.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Moderation history (sellers only) */}
      {user.role === 'SELLER' && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-bold mb-4">Moderation History</h2>
          {(moderationLogs as Array<{ id: string; action: string; reasonCategory: string | null; notes: string | null; createdAt: Date; admin: { name: string; email: string } }>).length === 0 ? (
            <p className="text-slate-500 text-sm">No moderation actions.</p>
          ) : (
            <div className="space-y-2">
              {(moderationLogs as Array<{ id: string; action: string; reasonCategory: string | null; notes: string | null; createdAt: Date; admin: { name: string; email: string } }>).map(log => (
                <div key={log.id} className="border border-slate-100 rounded-xl p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold">{log.action}</span>
                    <span className="text-xs text-slate-400">
                      {log.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">By {log.admin.name}</p>
                  {log.reasonCategory && (
                    <p className="text-xs text-slate-600 mt-0.5">
                      {REASON_LABELS[log.reasonCategory] ?? log.reasonCategory}
                    </p>
                  )}
                  {log.notes && <p className="text-xs text-slate-400 italic mt-0.5">{log.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
