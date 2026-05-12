import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import Link from 'next/link';
import type { Metadata } from 'next';
import ReportModerationForm from '@/components/ReportModerationForm';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Product Reports — Admin' };

const REASON_LABELS: Record<string, string> = {
  fake_counterfeit: 'Fake / counterfeit',
  misleading_description: 'Misleading description',
  misleading_photos: 'Misleading photos',
  prohibited_item: 'Prohibited item',
  scam_fraud: 'Scam / fraud',
  item_unavailable: 'Item unavailable',
  other: 'Other',
};

const ACTION_OPTIONS = [
  { value: 'dismiss', label: 'Dismiss report' },
  { value: 'resolve', label: 'Mark resolved (no further action)' },
  { value: 'hide_listing', label: 'Hide / remove listing' },
  { value: 'warn_seller', label: 'Warn seller (log only)' },
  { value: 'suspend_seller', label: 'Suspend seller' },
  { value: 'ban_seller', label: 'Ban seller (permanent)' },
];

function reportStatusBadge(status: string) {
  const map: Record<string, string> = {
    OPEN: 'badge-yellow',
    DISMISSED: 'badge-slate',
    RESOLVED: 'badge-green',
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

function productStatusBadge(status: string) {
  const map: Record<string, string> = {
    APPROVED: 'badge-green',
    PENDING: 'badge-yellow',
    REJECTED: 'badge-red',
    HIDDEN: 'badge-red',
    SOLD: 'badge-slate',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; success?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const { status: statusParam, error: errorParam, success: successParam } = await searchParams;
  const validStatuses = ['OPEN', 'DISMISSED', 'RESOLVED'];
  const activeStatus = validStatuses.includes(statusParam ?? '') ? (statusParam as string) : 'OPEN';

  const [reports, openCount, dismissedCount, resolvedCount] = await Promise.all([
    prisma.productReport.findMany({
      where: { status: activeStatus as any },
      orderBy: { createdAt: 'asc' },
      include: {
        product: { select: { id: true, title: true, status: true, imageUrl: true } },
        reporter: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true, sellerStatus: true } },
        admin: { select: { name: true, email: true } },
      },
    }),
    prisma.productReport.count({ where: { status: 'OPEN' } }),
    prisma.productReport.count({ where: { status: 'DISMISSED' } }),
    prisma.productReport.count({ where: { status: 'RESOLVED' } }),
  ]);

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Product Reports</h1>
          <p className="text-slate-500 text-sm">
            Review and moderate reported listings.
          </p>
        </div>
        <a href="/admin" className="btn-outline text-sm">← Admin Dashboard</a>
      </div>

      {successParam && (
        <div className="card p-4 mb-6 bg-green-50 border-green-200 text-green-800 text-sm">
          ✅ {successParam}
        </div>
      )}

      {errorParam && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          ⚠ {errorParam}
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { value: 'OPEN', label: 'Open', count: openCount },
          { value: 'DISMISSED', label: 'Dismissed', count: dismissedCount },
          { value: 'RESOLVED', label: 'Resolved', count: resolvedCount },
        ].map((tab) => (
          <a
            key={tab.value}
            href={`/admin/reports?status=${tab.value}`}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              activeStatus === tab.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 bg-white/20 text-inherit rounded-full px-1.5 py-0.5 text-xs">
                {tab.count}
              </span>
            )}
          </a>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          <p className="text-2xl mb-2">✓</p>
          <p className="font-semibold">No {activeStatus.toLowerCase()} reports.</p>
          {activeStatus === 'OPEN' && (
            <p className="text-sm mt-1">All caught up — no pending reports to review.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {reports.map((report) => (
            <div key={report.id} className="card p-6">
              {/* Report header */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={reportStatusBadge(report.status)}>{report.status}</span>
                    <span className="badge badge-red">{REASON_LABELS[report.reason] ?? report.reason}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(report.createdAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </span>
                  </div>
                  {report.notes && (
                    <p className="text-sm text-slate-700 mt-1 italic">"{report.notes}"</p>
                  )}
                </div>
              </div>

              {/* Product info */}
              <div className="flex gap-3 items-start mb-4 p-3 bg-slate-50 rounded-xl">
                {report.product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.product.imageUrl}
                    alt={report.product.title ?? 'Untitled listing'}
                    className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-slate-200 flex-shrink-0" aria-hidden="true" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 truncate">{report.product.title ?? 'Untitled listing'}</p>                    <span className={productStatusBadge(report.product.status)}>{report.product.status}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Sold by{' '}
                    <Link href={`/admin/users/${report.seller.id}`} className="font-medium hover:underline">
                      {report.seller.name ?? 'Unknown seller'}
                    </Link>
                    {report.seller.email ? ` (${report.seller.email})` : ''}
                    <span className={`ml-2 ${sellerStatusBadge(report.seller.sellerStatus ?? 'ACTIVE')}`}>
                      {report.seller.sellerStatus ?? 'ACTIVE'}
                    </span>
                  </p>
                  {report.product.status === 'APPROVED' && (
                    <Link
                      href={`/products/${report.product.id}`}
                      className="text-xs text-blue-600 hover:underline mt-0.5 inline-block"
                      target="_blank"
                    >
                      View listing ↗
                    </Link>
                  )}
                </div>
              </div>

              {/* Reporter info */}
              <div className="mb-4 text-xs text-slate-500">
                Reported by{' '}
                <Link href={`/admin/users/${report.reporter.id}`} className="font-medium hover:underline">
                  {report.reporter.name ?? 'Unknown user'}
                </Link>
                {report.reporter.email ? ` (${report.reporter.email})` : ''}
              </div>

              {/* Admin resolution (if resolved/dismissed) */}
              {report.status !== 'OPEN' && report.admin && (
                <div className="mb-4 p-3 bg-blue-50 rounded-xl text-xs text-blue-800">
                  <span className="font-semibold">Action taken:</span>{' '}
                  {ACTION_OPTIONS.find((a) => a.value === report.adminAction)?.label ?? report.adminAction ?? '—'}
                  {' '}by {report.admin.name ?? 'an admin'}
                  {report.resolvedAt && (
                    <> on {new Date(report.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                  )}
                  {report.adminNotes && (
                    <p className="mt-1 italic text-blue-700">Notes: {report.adminNotes}</p>
                  )}
                </div>
              )}

              {/* Moderation form (only for open reports) */}
              {report.status === 'OPEN' && (
                <ReportModerationForm reportId={report.id} />
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
