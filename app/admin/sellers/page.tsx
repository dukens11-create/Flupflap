import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seller Management — Admin' };

const REASON_LABELS: Record<string, string> = {
  misconduct_to_customer: 'Misconduct to customer',
  fake_product: 'Fake product',
  unlawful_activity: 'Unlawful activity',
  fraud: 'Fraud',
  spam: 'Spam',
  policy_violation: 'Policy violation',
  other: 'Other',
};

const REASON_OPTIONS = Object.entries(REASON_LABELS);

function statusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminSellersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER' },
    orderBy: { createdAt: 'desc' },
    include: {
      moderationLogsAsseller: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { admin: { select: { name: true, email: true } } },
      },
      _count: { select: { products: true } },
    },
  });

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Seller Management</h1>
          <p className="text-slate-500 text-sm">
            Suspend or ban seller accounts for policy violations.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
      </div>

      {sellers.length === 0 ? (
        <div className="card p-6 text-slate-500">No seller accounts yet.</div>
      ) : (
        <div className="space-y-6">
          {sellers.map(seller => (
            <div key={seller.id} className="card p-6">
              {/* Seller header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900">{seller.name}</p>
                    <span className={statusBadge(seller.sellerStatus)}>
                      {seller.sellerStatus}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{seller.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {seller._count.products} listing{seller._count.products !== 1 ? 's' : ''} ·
                    Joined {seller.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                  {seller.sellerStatusReason && seller.sellerStatus !== 'ACTIVE' && (
                    <p className="text-xs text-slate-600 mt-1">
                      Reason: <span className="font-medium">{REASON_LABELS[seller.sellerStatusReason] ?? seller.sellerStatusReason}</span>
                      {seller.sellerStatusNotes && ` — ${seller.sellerStatusNotes}`}
                    </p>
                  )}
                </div>
              </div>

              {/* Moderation form */}
              <details className="group">
                <summary className="cursor-pointer text-sm font-medium text-slate-600 hover:text-slate-900 select-none list-none flex items-center gap-1">
                  <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                  Moderation actions
                </summary>
                <form
                  action={`/api/admin/sellers/${seller.id}/moderate`}
                  method="POST"
                  className="mt-4 space-y-3 border-t border-slate-100 pt-4"
                >
                  <div className="flex gap-3 flex-wrap">
                    <div className="flex-1 min-w-[160px]">
                      <label className="label">Action</label>
                      <select name="action" className="input" required>
                        <option value="">Select action…</option>
                        <option value="SUSPENDED">Suspend (temporary)</option>
                        <option value="BANNED">Ban (permanent)</option>
                        <option value="REINSTATED">Reinstate (lift restriction)</option>
                      </select>
                    </div>
                    <div className="flex-1 min-w-[160px]">
                      <label className="label">Reason category</label>
                      <select name="reasonCategory" className="input">
                        <option value="">Select reason… (required unless reinstating)</option>
                        {REASON_OPTIONS.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Notes (optional, internal only)</label>
                    <textarea
                      name="notes"
                      className="input h-20 resize-none"
                      placeholder="Additional context visible only to admins…"
                      maxLength={1000}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary text-sm">
                      Apply action
                    </button>
                  </div>
                </form>
              </details>

              {/* Audit log */}
              {seller.moderationLogsAsseller.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Moderation history
                  </p>
                  <div className="space-y-2">
                    {seller.moderationLogsAsseller.map(log => (
                      <div key={log.id} className="text-xs text-slate-600 flex flex-wrap gap-x-3 gap-y-0.5">
                        <span className="font-medium">{log.action}</span>
                        <span className="text-slate-400">
                          {log.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          {' '}by {log.admin.name}
                        </span>
                        {log.reasonCategory && (
                          <span>{REASON_LABELS[log.reasonCategory] ?? log.reasonCategory}</span>
                        )}
                        {log.notes && <span className="text-slate-400 italic">{log.notes}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
