import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import {
  sellerPhoneVerificationLabel,
  sellerVerificationStatusTone,
} from '@/lib/seller-verification';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Seller Management — Admin' };

const DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
};

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

export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');
  const sp = await searchParams;

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER' },
    orderBy: { createdAt: 'desc' },
    include: {
      verificationSubmission: {
        include: {
          reviewedBy: { select: { name: true, email: true } },
        },
      },
      moderationLogsAsSeller: {
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

      {sp.verification === 'updated' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification review updated.
        </div>
      )}

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
                    Joined {seller.createdAt.toLocaleDateString('en-US', DATE_FORMAT_OPTIONS)}
                  </p>
                  {seller.sellerStatusReason && seller.sellerStatus !== 'ACTIVE' && (
                    <p className="text-xs text-slate-600 mt-1">
                      Reason: <span className="font-medium">{REASON_LABELS[seller.sellerStatusReason] ?? seller.sellerStatusReason}</span>
                      {seller.sellerStatusNotes && ` — ${seller.sellerStatusNotes}`}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`badge ${sellerVerificationStatusTone(seller.verificationSubmission?.status)}`}>
                      Verification {seller.verificationSubmission?.status ?? 'Not submitted'}
                    </span>
                    {seller.verificationSubmission?.phoneVerificationStatus && (
                      <span className="text-slate-500">
                        Phone verification: {sellerPhoneVerificationLabel(seller.verificationSubmission.phoneVerificationStatus)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Verification submission</p>
                    {seller.verificationSubmission ? (
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        <p>
                          <span className="font-medium text-slate-800">Phone:</span>{' '}
                          {seller.verificationSubmission.phoneNumber}
                        </p>
                        <p>
                          <span className="font-medium text-slate-800">Address:</span>{' '}
                          {seller.verificationSubmission.street}, {seller.verificationSubmission.city}, {seller.verificationSubmission.state} {seller.verificationSubmission.zipCode}, {seller.verificationSubmission.country}
                        </p>
                        {seller.verificationSubmission.rejectionReason && (
                          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                            <span className="font-medium">Rejection reason:</span>{' '}
                            {seller.verificationSubmission.rejectionReason}
                          </p>
                        )}
                        {seller.verificationSubmission.reviewedBy && seller.verificationSubmission.reviewedAt && (
                          <p className="text-xs text-slate-500">
                            Last reviewed {seller.verificationSubmission.reviewedAt.toLocaleDateString('en-US', DATE_FORMAT_OPTIONS)} by {seller.verificationSubmission.reviewedBy.name}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="mt-2 text-sm text-slate-500">
                        This seller has not submitted verification documents yet.
                      </p>
                    )}
                  </div>

                  {seller.verificationSubmission && (
                    <div className="flex flex-col gap-2 min-w-[180px]">
                      <a
                        href={`/api/seller/verification/documents/front?sellerId=${seller.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-outline text-xs text-center"
                      >
                        View ID front
                      </a>
                      <a
                        href={`/api/seller/verification/documents/back?sellerId=${seller.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-outline text-xs text-center"
                      >
                        View ID back
                      </a>
                      <a
                        href={`/api/seller/verification/documents/selfie?sellerId=${seller.id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-outline text-xs text-center"
                      >
                        View selfie
                      </a>
                    </div>
                  )}
                </div>

                {seller.verificationSubmission && (
                  <form
                    action={`/api/admin/sellers/${seller.id}/verification`}
                    method="POST"
                    className="mt-4 space-y-3 border-t border-slate-200 pt-4"
                  >
                    <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                      <div>
                        <label className="label">Decision</label>
                        <select name="status" className="input" required defaultValue="">
                          <option value="" disabled>Select status…</option>
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Rejection reason (required for rejection)</label>
                        <textarea
                          name="rejectionReason"
                          className="input h-20 resize-none"
                          maxLength={1000}
                          placeholder="Add clear guidance for the seller if documents are rejected…"
                        />
                      </div>
                    </div>
                    <button type="submit" className="btn-primary text-sm">
                      Save verification review
                    </button>
                  </form>
                )}
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
              {seller.moderationLogsAsSeller.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Moderation history
                  </p>
                  <div className="space-y-2">
                    {seller.moderationLogsAsSeller.map(log => (
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
