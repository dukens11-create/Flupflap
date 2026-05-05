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

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
  READY_FOR_PICKUP: 'Ready for Pickup',
  PICKED_UP: 'Picked Up',
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    PAID: 'badge-blue',
    SHIPPED: 'badge-green',
    DELIVERED: 'badge-green',
    PICKED_UP: 'badge-green',
    CANCELLED: 'badge-red',
    PENDING: 'badge-yellow',
    READY_FOR_PICKUP: 'badge-yellow',
    REFUNDED: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

function productStatusBadge(status: string) {
  const map: Record<string, string> = {
    APPROVED: 'badge-green',
    PENDING: 'badge-yellow',
    REJECTED: 'badge-red',
    SOLD: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

function sellerStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
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
      createdAt: true,
      sellerStatus: true,
      sellerStatusReason: true,
      sellerStatusNotes: true,
      stripeOnboardingComplete: true,
      // Never expose password or raw tokens
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          status: true,
          totalCents: true,
          isPickup: true,
          pickupCity: true,
          pickupState: true,
          createdAt: true,
          items: {
            select: {
              id: true,
              priceCents: true,
              quantity: true,
              product: { select: { id: true, title: true } },
            },
          },
          pickupConfirmation: {
            select: { confirmedAt: true, confirmedBy: true },
          },
        },
      },
      products: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          title: true,
          status: true,
          priceCents: true,
          createdAt: true,
          pickupAvailable: true,
          pickupCity: true,
          pickupState: true,
        },
      },
      moderationLogsAsSeller: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          reasonCategory: true,
          notes: true,
          createdAt: true,
          admin: { select: { name: true, email: true } },
        },
      },
      adminAccessLogsAsTarget: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          reason: true,
          createdAt: true,
          admin: { select: { name: true, email: true } },
        },
      },
    },
  });

  if (!user) notFound();

  // Log this admin access
  await prisma.adminAccessLog.create({
    data: {
      adminId: session.user.id,
      targetUserId: id,
      reason: 'admin_ui_view',
    },
  });

  return (
    <main className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link href="/admin/users" className="text-sm text-slate-500 hover:text-blue-600">← User Management</Link>
      </div>

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-2xl font-black">{user.name}</h1>
              <span className={`badge ${user.role === 'SELLER' ? 'badge-green' : user.role === 'ADMIN' ? 'badge-slate' : 'badge-blue'}`}>
                {user.role}
              </span>
              {user.role === 'SELLER' && (
                <span className={`badge ${sellerStatusBadge(user.sellerStatus)}`}>{user.sellerStatus}</span>
              )}
            </div>
            <p className="text-slate-500">{user.email}</p>
            {user.phone && <p className="text-sm text-slate-400 mt-0.5">📞 {user.phone}</p>}
            <p className="text-xs text-slate-400 mt-1">
              Joined {user.createdAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {user.role === 'SELLER' && (
              <Link href={`/admin/sellers`} className="btn-outline text-xs">
                Moderation →
              </Link>
            )}
          </div>
        </div>

        {/* Seller status info */}
        {user.role === 'SELLER' && user.sellerStatus !== 'ACTIVE' && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">
            <p className="font-semibold">Account restricted: {user.sellerStatus}</p>
            {user.sellerStatusReason && (
              <p>Reason: {REASON_LABELS[user.sellerStatusReason] ?? user.sellerStatusReason}</p>
            )}
            {user.sellerStatusNotes && <p className="text-red-700 italic">{user.sellerStatusNotes}</p>}
          </div>
        )}

        {user.role === 'SELLER' && (
          <p className="text-xs text-slate-400 mt-3">
            Stripe Connect: {user.stripeOnboardingComplete ? '✅ Connected' : '⚠️ Not connected'}
          </p>
        )}
      </div>

      {/* Admin support banner */}
      <div className="card p-3 mb-6 bg-amber-50 border-amber-200 text-amber-800 text-xs flex items-center gap-2">
        <span>🔒</span>
        <span>
          You are viewing this account as admin support. All access is logged for audit.
          Passwords and financial secrets are never shown here.
        </span>
      </div>

      {/* Orders */}
      <section className="mb-6">
        <h2 className="text-xl font-bold mb-3">
          {user.role === 'SELLER' ? 'Orders (as buyer)' : 'Orders'} ({user.orders.length})
        </h2>
        {user.orders.length === 0 ? (
          <div className="card p-4 text-slate-500 text-sm">No orders.</div>
        ) : (
          <div className="space-y-3">
            {user.orders.map(order => (
              <div key={order.id} className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-slate-400">#{order.id.slice(-8).toUpperCase()}</span>
                    {order.isPickup && <span className="badge badge-blue text-xs">📍 Pickup</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${statusBadge(order.status)}`}>
                      {ORDER_STATUS_LABELS[order.status] ?? order.status}
                    </span>
                    <span className="text-xs text-slate-400">
                      {order.createdAt.toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {order.items.map(item => (
                  <p key={item.id} className="text-sm text-slate-700">
                    {item.product.title} × {item.quantity} — {dollars(item.priceCents * item.quantity)}
                  </p>
                ))}
                <p className="text-sm font-bold mt-2">{dollars(order.totalCents)}</p>
                {order.isPickup && order.pickupConfirmation?.confirmedAt && (
                  <p className="text-xs text-green-700 mt-1">
                    ✅ Picked up on {new Date(order.pickupConfirmation.confirmedAt).toLocaleDateString()}
                  </p>
                )}
                {order.isPickup && !order.pickupConfirmation?.confirmedAt && (
                  <p className="text-xs text-yellow-700 mt-1">⏳ Awaiting pickup confirmation</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Listings (sellers only) */}
      {user.role === 'SELLER' && (
        <section className="mb-6">
          <h2 className="text-xl font-bold mb-3">Listings ({user.products.length})</h2>
          {user.products.length === 0 ? (
            <div className="card p-4 text-slate-500 text-sm">No listings.</div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left bg-slate-50">
                    <th className="px-4 py-2 font-semibold text-slate-600">Title</th>
                    <th className="px-4 py-2 font-semibold text-slate-600">Status</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 text-right">Price</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 hidden md:table-cell">Pickup</th>
                    <th className="px-4 py-2 font-semibold text-slate-600 hidden md:table-cell">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {user.products.map(p => (
                    <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2 font-medium text-slate-800 truncate max-w-[200px]">{p.title}</td>
                      <td className="px-4 py-2"><span className={`badge ${productStatusBadge(p.status)}`}>{p.status}</span></td>
                      <td className="px-4 py-2 text-right text-slate-700">{dollars(p.priceCents)}</td>
                      <td className="px-4 py-2 hidden md:table-cell text-slate-500 text-xs">
                        {p.pickupAvailable ? `📍 ${p.pickupCity ?? ''}${p.pickupState ? `, ${p.pickupState}` : ''}` : '—'}
                      </td>
                      <td className="px-4 py-2 text-slate-400 hidden md:table-cell text-xs">{p.createdAt.toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Moderation history (sellers only) */}
      {user.role === 'SELLER' && user.moderationLogsAsSeller.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xl font-bold mb-3">Moderation History</h2>
          <div className="space-y-2">
            {user.moderationLogsAsSeller.map(log => (
              <div key={log.id} className="card p-4 text-sm">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="font-semibold">{log.action}</span>
                  <span className="text-slate-400">
                    {log.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {' '}by {log.admin.name}
                  </span>
                  {log.reasonCategory && (
                    <span className="text-slate-600">{REASON_LABELS[log.reasonCategory] ?? log.reasonCategory}</span>
                  )}
                </div>
                {log.notes && <p className="text-slate-500 italic mt-1 text-xs">{log.notes}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Admin access audit log */}
      {user.adminAccessLogsAsTarget.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xl font-bold mb-3">Admin Access Log</h2>
          <div className="card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left bg-slate-50">
                  <th className="px-4 py-2 font-semibold text-slate-600">Admin</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">When</th>
                  <th className="px-4 py-2 font-semibold text-slate-600">Reason</th>
                </tr>
              </thead>
              <tbody>
                {user.adminAccessLogsAsTarget.map(log => (
                  <tr key={log.id} className="border-b border-slate-50">
                    <td className="px-4 py-2 text-slate-700">{log.admin.name}</td>
                    <td className="px-4 py-2 text-slate-400">{log.createdAt.toLocaleString()}</td>
                    <td className="px-4 py-2 text-slate-500">{log.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
