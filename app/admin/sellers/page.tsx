import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { DEFAULT_DATE_FORMAT_OPTIONS } from '@/lib/date-format';
import { prisma } from '@/lib/db';
import {
  buildSellerRiskAssessment,
  SELLER_HIGH_RISK_THRESHOLD,
} from '@/lib/seller-risk';
import {
  sellerKycProviderLabel,
  sellerPhoneVerificationLabel,
  sellerVerificationStatusTone,
} from '@/lib/seller-verification';

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

function riskBadge(score: number) {
  if (score >= 75) return 'badge-red';
  if (score >= SELLER_HIGH_RISK_THRESHOLD) return 'badge-yellow';
  if (score >= 35) return 'badge-slate';
  return 'badge-green';
}

function factorClasses(impact: number) {
  if (impact < 0) return 'border-green-200 bg-green-50 text-green-700';
  if (impact >= 15) return 'border-red-200 bg-red-50 text-red-700';
  if (impact >= 8) return 'border-yellow-200 bg-yellow-50 text-yellow-800';
  return 'border-slate-200 bg-white text-slate-700';
}

function formatAccountAge(days: number) {
  if (days < 1) return 'Joined today';
  if (days === 1) return 'Joined 1 day ago';
  if (days < 30) return `Joined ${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return 'Joined 1 month ago';
  if (months < 12) return `Joined ${months} months ago`;

  const years = Math.floor(months / 12);
  return years === 1 ? 'Joined 1 year ago' : `Joined ${years} years ago`;
}

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
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
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      phoneVerified: true,
      sellerStatus: true,
      sellerStatusReason: true,
      sellerStatusNotes: true,
      createdAt: true,
      verificationSubmission: {
        select: {
          provider: true,
          status: true,
          rejectionReason: true,
          governmentIdVerified: true,
          selfieVerified: true,
          addressVerified: true,
          phoneVerified: true,
          phoneNumber: true,
          phoneVerificationStatus: true,
          street: true,
          city: true,
          state: true,
          zipCode: true,
          country: true,
          adminFallbackStatus: true,
          adminFallbackReason: true,
          reviewedAt: true,
          reviewedBy: { select: { name: true, email: true } },
        },
      },
      moderationLogsAsSeller: {
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          action: true,
          reasonCategory: true,
          notes: true,
          createdAt: true,
          admin: { select: { name: true, email: true } },
        },
      },
      products: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      },
      reportsAboutSeller: {
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      },
    },
  });

  const sellerReviews = sellers
    .map((seller) => {
      const risk = buildSellerRiskAssessment({
        createdAt: seller.createdAt,
        image: seller.image,
        phone: seller.phone,
        phoneVerified: seller.phoneVerified,
        sellerStatus: seller.sellerStatus,
        products: seller.products,
        reports: seller.reportsAboutSeller,
        moderationLogs: seller.moderationLogsAsSeller,
        verification: seller.verificationSubmission,
      });

      return {
        ...seller,
        risk,
      };
    })
    .sort((a, b) => (
      Number(b.risk.requiresReview) - Number(a.risk.requiresReview)
      || b.risk.score - a.risk.score
      || b.createdAt.getTime() - a.createdAt.getTime()
    ));

  const attentionQueue = sellerReviews.filter((seller) => seller.risk.requiresReview);
  const highRiskCount = sellerReviews.filter((seller) => (
    seller.risk.score >= SELLER_HIGH_RISK_THRESHOLD
  )).length;
  const pendingVerificationCount = sellerReviews.filter((seller) => (
    seller.verificationSubmission?.status === 'PENDING'
  )).length;
  const rejectedVerificationCount = sellerReviews.filter((seller) => (
    seller.verificationSubmission?.status === 'REJECTED'
  )).length;
  const openReportsCount = sellerReviews.reduce((sum, seller) => (
    sum + seller.risk.metrics.openReportsCount
  ), 0);

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black">Seller Management</h1>
          <p className="text-slate-500 text-sm">
            Fraud review dashboard, manual approval tools, and seller risk scoring.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="#fraud-review" className="btn-outline text-sm">Fraud review ↓</a>
          <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
        </div>
      </div>

      {sp.verification === 'updated' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification review updated.
        </div>
      )}

      <section id="fraud-review" className="mb-8">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="card p-4 text-center">
            <p className={`text-3xl font-black ${attentionQueue.length > 0 ? 'text-red-600' : 'text-slate-600'}`}>
              {attentionQueue.length}
            </p>
            <p className="text-sm text-slate-500">Need review now</p>
          </div>
          <div className="card p-4 text-center">
            <p className={`text-3xl font-black ${highRiskCount > 0 ? 'text-yellow-600' : 'text-slate-600'}`}>
              {highRiskCount}
            </p>
            <p className="text-sm text-slate-500">High-risk sellers</p>
          </div>
          <div className="card p-4 text-center">
            <p className={`text-3xl font-black ${pendingVerificationCount > 0 ? 'text-blue-600' : 'text-slate-600'}`}>
              {pendingVerificationCount}
            </p>
            <p className="text-sm text-slate-500">Pending verification reviews</p>
          </div>
          <div className="card p-4 text-center">
            <p className={`text-3xl font-black ${openReportsCount > 0 ? 'text-red-600' : 'text-slate-600'}`}>
              {openReportsCount}
            </p>
            <p className="text-sm text-slate-500">Open seller reports</p>
          </div>
        </div>

        <div className="card mt-4 p-5">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-xl font-bold">Attention queue</h2>
              <p className="text-sm text-slate-500">
                Scores combine verification status, profile completeness, reports, listing behavior, and moderation history.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="badge badge-red">{pluralize(rejectedVerificationCount, 'rejected verification')}</span>
              <span className="badge badge-yellow">{pluralize(highRiskCount, 'high-risk seller')}</span>
            </div>
          </div>

          {attentionQueue.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              No sellers currently need manual fraud review.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {attentionQueue.map((seller) => (
                <div
                  key={seller.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{seller.name}</p>
                        <span className={`badge ${riskBadge(seller.risk.score)}`}>
                          {seller.risk.band} risk · {seller.risk.score}/100
                        </span>
                        <span className={`badge ${sellerVerificationStatusTone(seller.verificationSubmission?.status)}`}>
                          Verification {seller.verificationSubmission?.status ?? 'Not submitted'}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{seller.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span>{pluralize(seller.risk.metrics.openReportsCount, 'open report')}</span>
                        <span>·</span>
                        <span>{pluralize(seller.risk.metrics.recentListingsCount, 'recent listing')}</span>
                        <span>·</span>
                        <span>{pluralize(seller.risk.metrics.flaggedListingsCount, 'flagged listing')}</span>
                      </div>
                      {seller.risk.factors[0] && (
                        <p className="mt-2 text-sm text-slate-600">
                          Top signal: <span className="font-medium text-slate-800">{seller.risk.factors[0].label}</span>
                        </p>
                      )}
                    </div>
                    <a href={`#seller-${seller.id}`} className="btn-primary text-sm">
                      Review seller
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {sellerReviews.length === 0 ? (
        <div className="card p-6 text-slate-500">No seller accounts yet.</div>
      ) : (
        <div id="seller-list" className="space-y-6">
          {sellerReviews.map((seller) => (
            <div key={seller.id} id={`seller-${seller.id}`} className="card p-6">
              <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-bold text-slate-900">{seller.name}</p>
                    <span className={statusBadge(seller.sellerStatus)}>
                      {seller.sellerStatus}
                    </span>
                    <span className={`badge ${riskBadge(seller.risk.score)}`}>
                      {seller.risk.band} risk · {seller.risk.score}/100
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">{seller.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {seller.products.length} listing{seller.products.length !== 1 ? 's' : ''} ·{' '}
                    {formatAccountAge(seller.risk.metrics.accountAgeDays)} ·{' '}
                    Joined {seller.createdAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}
                  </p>
                  {seller.sellerStatusReason && seller.sellerStatus !== 'ACTIVE' && (
                    <p className="text-xs text-slate-600 mt-1">
                      Reason:{' '}
                      <span className="font-medium">
                        {REASON_LABELS[seller.sellerStatusReason] ?? seller.sellerStatusReason}
                      </span>
                      {seller.sellerStatusNotes && ` — ${seller.sellerStatusNotes}`}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`badge ${sellerVerificationStatusTone(seller.verificationSubmission?.status)}`}>
                      Verification {seller.verificationSubmission?.status ?? 'Not submitted'}
                    </span>
                    {seller.verificationSubmission?.provider && (
                      <span className="text-slate-500">
                        Provider: {sellerKycProviderLabel(seller.verificationSubmission.provider)}
                      </span>
                    )}
                    {seller.verificationSubmission?.phoneVerificationStatus && (
                      <span className="text-slate-500">
                        Phone verification: {sellerPhoneVerificationLabel(seller.verificationSubmission.phoneVerificationStatus)}
                      </span>
                    )}
                    <span className="text-slate-500">
                      Open reports: {seller.risk.metrics.openReportsCount}
                    </span>
                    <span className="text-slate-500">
                      Flagged listings: {seller.risk.metrics.flaggedListingsCount}
                    </span>
                  </div>
                </div>

                <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Seller risk score</p>
                      <p className="text-xs text-slate-500">
                        Simple heuristic based on verification, reports, listings, and moderation history.
                      </p>
                    </div>
                    <span className={`badge ${riskBadge(seller.risk.score)}`}>
                      {seller.risk.band} · {seller.risk.score}/100
                    </span>
                  </div>

                  {seller.risk.factors.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No meaningful trust signals yet.</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {seller.risk.factors.slice(0, 5).map((factor) => (
                        <span
                          key={`${seller.id}-${factor.label}`}
                          className={`rounded-full border px-3 py-1 text-xs ${factorClasses(factor.impact)}`}
                        >
                          {factor.impact > 0 ? '+' : ''}
                          {factor.impact} · {factor.label}
                        </span>
                      ))}
                    </div>
                  )}
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
                        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.governmentIdVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>ID: {seller.verificationSubmission.governmentIdVerified ? 'Verified' : 'Pending'}</p>
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.selfieVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Selfie: {seller.verificationSubmission.selfieVerified ? 'Verified' : 'Pending'}</p>
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.addressVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Address: {seller.verificationSubmission.addressVerified ? 'Verified' : 'Pending'}</p>
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.phoneVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Phone: {seller.verificationSubmission.phoneVerified ? 'Verified' : 'Pending'}</p>
                        </div>
                        {seller.verificationSubmission.adminFallbackStatus !== 'NOT_REQUIRED' && (
                          <p className="text-xs text-slate-500">
                            Admin fallback: {seller.verificationSubmission.adminFallbackStatus}
                            {seller.verificationSubmission.adminFallbackReason
                              ? ` — ${seller.verificationSubmission.adminFallbackReason}`
                              : ''}
                          </p>
                        )}
                        {seller.verificationSubmission.reviewedBy && seller.verificationSubmission.reviewedAt && (
                          <p className="text-xs text-slate-500">
                            Last reviewed {seller.verificationSubmission.reviewedAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)} by {seller.verificationSubmission.reviewedBy.name}
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
                    <div className="flex flex-col gap-1">
                      <p className="text-sm font-semibold text-slate-900">Manual approval / rejection</p>
                      <p className="text-xs text-slate-500">
                        Use this to approve or reject the seller verification submission after reviewing the risk signals above.
                      </p>
                    </div>
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
                    <div>
                      <label className="label">Admin fallback notes (internal)</label>
                      <textarea
                        name="adminFallbackReason"
                        className="input h-16 resize-none"
                        maxLength={1000}
                        placeholder="Optional internal notes for admin fallback review."
                      />
                    </div>
                    <button type="submit" className="btn-primary text-sm">
                      Save verification review
                    </button>
                  </form>
                )}
              </div>

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

              {seller.moderationLogsAsSeller.length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Moderation history
                  </p>
                  <div className="space-y-2">
                    {seller.moderationLogsAsSeller.map((log) => (
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
