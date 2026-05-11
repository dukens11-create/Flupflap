import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { DEFAULT_DATE_FORMAT_OPTIONS } from '@/lib/date-format';
import { prisma } from '@/lib/db';
import type { Metadata } from 'next';
import {
  sellerKycProviderLabel,
  sellerPhoneVerificationLabel,
} from '@/lib/seller-verification';
import { SellerStatus, KycStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import {
  getSellerKycCounts,
  KYC_APPROVED_WHERE,
  KYC_PENDING_REVIEW_WHERE,
  KYC_REJECTED_WHERE,
  KYC_NOT_SUBMITTED_WHERE,
  deriveEffectiveKycStatus,
} from '@/lib/seller-kyc-stats';

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
    PENDING: 'badge-yellow',
    RESTRICTED: 'badge-red',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

function kycStatusBadge(status: string) {
  const map: Record<string, string> = {
    APPROVED: 'badge-green',
    PENDING_REVIEW: 'badge-yellow',
    REJECTED: 'badge-red',
    NOT_SUBMITTED: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

function kycStatusLabel(status: string) {
  const map: Record<string, string> = {
    APPROVED: 'KYC Approved',
    PENDING_REVIEW: 'KYC Pending Review',
    REJECTED: 'KYC Rejected',
    NOT_SUBMITTED: 'KYC Not Submitted',
  };
  return map[status] ?? status;
}

const SELLER_STATUS_FILTER_OPTIONS = [
  { value: '', label: 'All Sellers' },
  { value: 'PENDING', label: 'Pending Seller Accounts' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'RESTRICTED', label: 'Restricted' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'BANNED', label: 'Banned' },
] as const;

const KYC_FILTER_OPTIONS = [
  { value: '', label: 'All KYC' },
  { value: 'PENDING_REVIEW', label: 'Pending KYC' },
  { value: 'APPROVED', label: 'KYC Approved' },
  { value: 'REJECTED', label: 'KYC Rejected' },
  { value: 'NOT_SUBMITTED', label: 'Not Submitted' },
] as const;

export default async function AdminSellersPage({
  searchParams,
}: {
  searchParams: Promise<{ verification?: string; kyc?: string; status?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');
  const sp = await searchParams;
  const kycFilter = sp.kyc ?? '';
  const statusFilter = sp.status ?? '';

  // Build the seller status filter for the DB query.
  const validSellerStatuses = Object.values(SellerStatus);
  const parsedStatus = validSellerStatuses.includes(statusFilter as SellerStatus)
    ? (statusFilter as SellerStatus)
    : null;
  const sellerStatusFilter = parsedStatus ? { sellerStatus: parsedStatus } : {};

  // Build the KYC status filter using the shared WHERE helpers.
  // All KYC statuses use the same defensive conditions as getSellerKycCounts()
  // so the seller list and count badges always stay in sync.
  const validKycStatuses = Object.values(KycStatus);
  const parsedKyc = validKycStatuses.includes(kycFilter as KycStatus)
    ? (kycFilter as KycStatus)
    : null;
  const KYC_WHERE_MAP: Partial<Record<KycStatus, Prisma.UserWhereInput>> = {
    APPROVED: KYC_APPROVED_WHERE,
    PENDING_REVIEW: KYC_PENDING_REVIEW_WHERE,
    REJECTED: KYC_REJECTED_WHERE,
    NOT_SUBMITTED: KYC_NOT_SUBMITTED_WHERE,
  };
  const kycStatusFilter: Prisma.UserWhereInput = parsedKyc
    ? (KYC_WHERE_MAP[parsedKyc] ?? { kycStatus: parsedKyc })
    : {};

  const sellers = await prisma.user.findMany({
    where: { role: 'SELLER', ...sellerStatusFilter, ...kycStatusFilter },
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

  // Count sellers per seller status and KYC status for tab badges.
  // KYC counts use the shared helpers that check both kycStatus and the legacy
  // verifiedSeller flag so previously-approved sellers are never miscounted.
  const [
    pendingStatusCount,
    activeStatusCount,
    restrictedStatusCount,
    suspendedStatusCount,
    bannedStatusCount,
    { kycPendingCount, kycApprovedCount, kycRejectedCount, kycNotSubmittedCount },
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'SELLER', sellerStatus: 'PENDING' } }),
    prisma.user.count({ where: { role: 'SELLER', sellerStatus: 'ACTIVE' } }),
    prisma.user.count({ where: { role: 'SELLER', sellerStatus: 'RESTRICTED' } }),
    prisma.user.count({ where: { role: 'SELLER', sellerStatus: 'SUSPENDED' } }),
    prisma.user.count({ where: { role: 'SELLER', sellerStatus: 'BANNED' } }),
    getSellerKycCounts(),
  ]);

  const totalSellerCount = pendingStatusCount + activeStatusCount + restrictedStatusCount + suspendedStatusCount + bannedStatusCount;

  const sellerStatusCounts: Record<string, number> = {
    '': totalSellerCount,
    PENDING: pendingStatusCount,
    ACTIVE: activeStatusCount,
    RESTRICTED: restrictedStatusCount,
    SUSPENDED: suspendedStatusCount,
    BANNED: bannedStatusCount,
  };

  const kycCounts: Record<string, number> = {
    '': totalSellerCount,
    PENDING_REVIEW: kycPendingCount,
    APPROVED: kycApprovedCount,
    REJECTED: kycRejectedCount,
    NOT_SUBMITTED: kycNotSubmittedCount,
  };

  return (
    <main id="kyc-verification" className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Seller Management</h1>
          <p className="text-slate-500 text-sm">
            Review KYC verification submissions and manage seller accounts.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
      </div>

      {sp.verification === 'updated' && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ Seller verification review updated.
        </div>
      )}

      {/* Seller Account Status Filter */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filter by Seller Account Status</p>
        <div className="flex flex-wrap gap-2">
          {SELLER_STATUS_FILTER_OPTIONS.map(({ value, label }) => {
            const isActive = statusFilter === value;
            const count = sellerStatusCounts[value] ?? 0;
            // Build href preserving the current kyc filter param if set.
            const params = new URLSearchParams();
            if (value) params.set('status', value);
            if (kycFilter) params.set('kyc', kycFilter);
            const href = `/admin/sellers${params.toString() ? `?${params}` : ''}`;
            return (
              <a
                key={value}
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {label}
                <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold min-w-[20px] ${
                  isActive ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-600'
                }`}>
                  {count}
                </span>
              </a>
            );
          })}
        </div>
      </div>

      {/* KYC Status Filter Tabs */}
      <div className="mb-6">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Filter by KYC Status</p>
        <div className="flex flex-wrap gap-2">
          {KYC_FILTER_OPTIONS.map(({ value, label }) => {
            const isActive = kycFilter === value;
            const count = kycCounts[value] ?? 0;
            // Build href preserving the current status filter param if set.
            const params = new URLSearchParams();
            if (statusFilter) params.set('status', statusFilter);
            if (value) params.set('kyc', value);
            const href = `/admin/sellers${params.toString() ? `?${params}` : ''}`;
            return (
              <a
                key={value}
                href={href}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                }`}
              >
                {label}
                <span className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold min-w-[20px] ${
                  isActive ? 'bg-white text-slate-900' : 'bg-slate-100 text-slate-600'
                }`}>
                  {count}
                </span>
              </a>
            );
          })}
        </div>
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
                    Joined {seller.createdAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}
                  </p>
                  {seller.sellerStatusReason && seller.sellerStatus !== 'ACTIVE' && (
                    <p className="text-xs text-slate-600 mt-1">
                      Reason: <span className="font-medium">{REASON_LABELS[seller.sellerStatusReason] ?? seller.sellerStatusReason}</span>
                      {seller.sellerStatusNotes && ` — ${seller.sellerStatusNotes}`}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span className={`badge ${kycStatusBadge(deriveEffectiveKycStatus(seller))}`}>
                      {kycStatusLabel(deriveEffectiveKycStatus(seller))}
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
                    {seller.verifiedSeller && seller.approvedAt && (
                      <span className="text-green-600 font-medium">
                        ✓ Verified · Approved {seller.approvedAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">KYC Verification</p>
                    {seller.verificationSubmission ? (
                      <div className="mt-3 space-y-2 text-sm text-slate-600">
                        {seller.verificationSubmission.kycStartedAt && (
                          <p className="text-xs text-slate-500">
                            Submitted {seller.verificationSubmission.kycStartedAt.toLocaleDateString('en-US', DEFAULT_DATE_FORMAT_OPTIONS)}
                          </p>
                        )}
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
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.addressVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Address: {seller.verificationSubmission.addressVerified ? 'Verified' : 'Supplementary'}</p>
                          <p className={`rounded border px-2 py-1 ${seller.verificationSubmission.phoneVerified ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white'}`}>Phone: {seller.verificationSubmission.phoneVerified ? 'Verified' : 'Supplementary'}</p>
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
                        <option value="RESTRICTED">Restrict (partial restriction)</option>
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
