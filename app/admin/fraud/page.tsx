import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';
import { getListingRiskAssessment, type ListingRiskAssessment } from '@/lib/fraud-detection';
import { describeSuspiciousReason } from '@/lib/login-security';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Fraud Protection — Admin' };

const SELLER_REPORT_REASON_LABELS: Record<string, string> = {
  scam_fraud: 'Scam / fraud concern',
  off_platform_payment: 'Asked for off-platform payment',
  counterfeit_behavior: 'Likely fake or counterfeit items',
  non_delivery: 'Takes payment but does not deliver',
  abusive_behavior: 'Abusive or harassing behavior',
  other: 'Other',
};

const SELLER_REPORT_ACTIONS = [
  { value: 'dismiss', label: 'Dismiss' },
  { value: 'resolve', label: 'Resolve only' },
  { value: 'warn_seller', label: 'Warn seller' },
  { value: 'suspend_seller', label: 'Suspend seller' },
  { value: 'ban_seller', label: 'Ban seller' },
] as const;
const SUSPICIOUS_LOGIN_LOOKBACK_DAYS = 30;
const LISTING_LOOKBACK_DAYS = 45;

function riskTone(level: 'LOW' | 'MEDIUM' | 'HIGH' | 'NONE') {
  return level === 'HIGH'
    ? 'badge-red'
    : level === 'MEDIUM'
      ? 'badge-yellow'
      : 'badge-slate';
}

function sellerStatusBadge(status: string) {
  const map: Record<string, string> = {
    ACTIVE: 'badge-green',
    SUSPENDED: 'badge-yellow',
    BANNED: 'badge-red',
  };
  return map[status] ?? 'badge-slate';
}

export default async function AdminFraudPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const suspiciousSince = new Date(Date.now() - 1000 * 60 * 60 * 24 * SUSPICIOUS_LOGIN_LOOKBACK_DAYS);
  const listingLookback = new Date(Date.now() - 1000 * 60 * 60 * 24 * LISTING_LOOKBACK_DAYS);

  const [recentListings, sellerReports, suspiciousLogins] = await Promise.all([
    prisma.product.findMany({
      where: {
        status: { in: ['PENDING', 'APPROVED', 'SOLD'] },
        createdAt: { gte: listingLookback },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      include: {
        seller: {
          select: {
            id: true,
            name: true,
            email: true,
            sellerStatus: true,
          },
        },
      },
    }),
    prisma.sellerReport.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      take: 20,
      include: {
        seller: { select: { id: true, name: true, email: true, sellerStatus: true } },
        reporter: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.loginActivity.findMany({
      where: {
        suspicious: true,
        createdAt: { gte: suspiciousSince },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
      },
    }),
  ]);

  const comparisonListings = recentListings.map((listing: (typeof recentListings)[number]) => ({
    id: listing.id,
    sellerId: listing.sellerId,
    title: listing.title,
    description: listing.description,
    priceCents: listing.priceCents,
    category: listing.category,
    condition: listing.condition,
    imageUrl: listing.imageUrl,
    status: listing.status,
    createdAt: listing.createdAt,
  }));

  type RiskyListing = { listing: (typeof recentListings)[number]; assessment: ListingRiskAssessment };
  const riskyListings: RiskyListing[] = recentListings
    .map((listing: (typeof recentListings)[number]) => {
      const windowStart = new Date(listing.createdAt);
      windowStart.setHours(windowStart.getHours() - 24);
      const sellerRecentCount = recentListings.filter(
        (candidate: (typeof recentListings)[number]) =>
          candidate.sellerId === listing.sellerId &&
          candidate.createdAt >= windowStart &&
          candidate.createdAt <= listing.createdAt,
      ).length;

      const assessment = getListingRiskAssessment(
        {
          id: listing.id,
          sellerId: listing.sellerId,
          title: listing.title,
          description: listing.description,
          priceCents: listing.priceCents,
          category: listing.category,
          condition: listing.condition,
          imageUrl: listing.imageUrl,
          createdAt: listing.createdAt,
        },
        comparisonListings,
        sellerRecentCount,
      );

      return { listing, assessment };
    })
    .filter((item: RiskyListing) => item.assessment.level !== 'NONE')
    .sort((a: RiskyListing, b: RiskyListing) => b.assessment.score - a.assessment.score)
    .slice(0, 15);

  const listingTitleById = new Map(recentListings.map((listing: (typeof recentListings)[number]) => [listing.id, listing.title]));

  return (
    <main className="max-w-6xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Fraud Protection</h1>
          <p className="text-sm text-slate-500">
            Review suspicious listings, seller reports, and login alerts in one queue.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin" className="btn-outline text-sm">← Admin Dashboard</Link>
          <Link href="/admin/reports" className="btn-outline text-sm">Product reports →</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Flagged listings</p>
          <p className="mt-2 text-3xl font-black text-red-600">{riskyListings.length}</p>
          <p className="text-sm text-slate-500">Recent listings with fake or duplicate risk signals</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Open seller reports</p>
          <p className="mt-2 text-3xl font-black text-amber-600">{sellerReports.length}</p>
          <p className="text-sm text-slate-500">Buyer-submitted reports about suspicious sellers</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Suspicious logins</p>
          <p className="mt-2 text-3xl font-black text-indigo-600">{suspiciousLogins.length}</p>
          <p className="text-sm text-slate-500">New device or network changes in the last 30 days</p>
        </div>
      </div>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Flagged listing signals</h2>
          <p className="text-xs text-slate-500">Explainable heuristics only — no hidden scoring model</p>
        </div>
        {riskyListings.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No recent listings triggered fraud heuristics.</div>
        ) : (
          <div className="space-y-4">
            {riskyListings.map(({ listing, assessment }) => (
              <div key={listing.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900">{listing.title}</h3>
                      <span className={`badge ${riskTone(assessment.level)}`}>{assessment.level} risk</span>
                      <span className="badge badge-slate">Score {assessment.score}</span>
                    </div>
                    <p className="text-sm text-slate-500 mt-1">
                      {listing.category} · {listing.condition} · {dollars(listing.priceCents)} · sold by{' '}
                      <Link href={`/admin/users/${listing.seller.id}`} className="font-medium hover:underline">
                        {listing.seller.name}
                      </Link>
                      {' '}({listing.seller.email})
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Created {listing.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      <span className={`ml-2 ${sellerStatusBadge(listing.seller.sellerStatus)}`}>{listing.seller.sellerStatus}</span>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {listing.status === 'PENDING' && (
                      <>
                        <form action={`/api/admin/products/${listing.id}`} method="POST">
                          <input type="hidden" name="_method" value="approve" />
                          <input type="hidden" name="redirectTo" value="/admin/fraud" />
                          <button type="submit" className="btn bg-green-600 hover:bg-green-700 text-white text-sm">Approve</button>
                        </form>
                        <form action={`/api/admin/products/${listing.id}`} method="POST">
                          <input type="hidden" name="_method" value="reject" />
                          <input type="hidden" name="redirectTo" value="/admin/fraud" />
                          <button type="submit" className="btn bg-red-600 hover:bg-red-700 text-white text-sm">Reject</button>
                        </form>
                      </>
                    )}
                    <form action={`/api/admin/products/${listing.id}`} method="POST">
                      <input type="hidden" name="_method" value="hide" />
                      <input type="hidden" name="redirectTo" value="/admin/fraud" />
                      <button type="submit" className="btn bg-slate-900 hover:bg-slate-800 text-white text-sm">Hide listing</button>
                    </form>
                    {listing.status === 'APPROVED' && (
                      <Link href={`/products/${listing.id}`} target="_blank" className="btn-outline text-sm">
                        View listing ↗
                      </Link>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {assessment.reasons.map((reason) => (
                    <div key={`${listing.id}-${reason.code}-${reason.detail}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-sm font-semibold text-slate-900">{reason.label}</p>
                      <p className="text-xs text-slate-600 mt-1">{reason.detail}</p>
                      {reason.duplicateProductIds && reason.duplicateProductIds.length > 0 && (
                        <div className="mt-2 text-xs text-slate-500">
                          Matches:{' '}
                          {reason.duplicateProductIds.map((id, index) => (
                            <span key={id}>
                              {index > 0 && ', '}
                              <Link href={`/products/${id}`} target="_blank" className="text-blue-600 hover:underline">
                                {String(listingTitleById.get(id) ?? (id.length > 6 ? id.slice(-6) : id))}
                              </Link>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Seller reports</h2>
          <p className="text-xs text-slate-500">Filed from buyer-facing listing pages</p>
        </div>
        {sellerReports.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No open seller reports.</div>
        ) : (
          <div className="space-y-4">
            {sellerReports.map((report: (typeof sellerReports)[number]) => (
              <div key={report.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge badge-yellow">OPEN</span>
                      <span className="badge badge-red">{SELLER_REPORT_REASON_LABELS[report.reason] ?? report.reason}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-700">
                      Seller{' '}
                      <Link href={`/admin/users/${report.seller.id}`} className="font-medium hover:underline">
                        {report.seller.name}
                      </Link>
                      {' '}({report.seller.email})
                    </p>
                    <p className="text-xs text-slate-500">
                      Reported by{' '}
                      <Link href={`/admin/users/${report.reporter.id}`} className="font-medium hover:underline">
                        {report.reporter.name}
                      </Link>
                      {' '}({report.reporter.email})
                    </p>
                    {report.notes && (
                      <p className="mt-2 text-sm text-slate-600 italic">"{report.notes}"</p>
                    )}
                  </div>
                  <span className={`self-start ${sellerStatusBadge(report.seller.sellerStatus)}`}>
                    {report.seller.sellerStatus}
                  </span>
                </div>
                <form
                  action={`/api/admin/seller-reports/${report.id}/moderate`}
                  method="POST"
                  className="mt-4 grid gap-3 md:grid-cols-[220px_1fr_auto]"
                >
                  <select name="action" className="input text-sm" required defaultValue="">
                    <option value="" disabled>Select action…</option>
                    {SELLER_REPORT_ACTIONS.map((action) => (
                      <option key={action.value} value={action.value}>{action.label}</option>
                    ))}
                  </select>
                  <textarea
                    name="adminNotes"
                    className="input h-24 resize-none"
                    placeholder="Internal notes for trust & safety review"
                    maxLength={2000}
                  />
                  <button type="submit" className="btn-primary text-sm h-fit">
                    Apply
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold">Suspicious login alerts</h2>
          <p className="text-xs text-slate-500">New device + network changes recorded at sign-in</p>
        </div>
        {suspiciousLogins.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">No suspicious login alerts in the last 30 days.</div>
        ) : (
          <div className="space-y-3">
            {suspiciousLogins.map((login: (typeof suspiciousLogins)[number]) => (
              <div key={login.id} className="card p-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-medium text-slate-900">
                    <Link href={`/admin/users/${login.user.id}`} className="hover:underline">
                      {login.user.name}
                    </Link>
                    {' '}({login.user.email})
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {login.deviceLabel ?? 'Unknown device'} · {login.ipLabel ?? 'Unknown network'} ·{' '}
                    {login.createdAt.toLocaleString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {login.suspiciousReasons.map((reason: string) => (
                    <span key={`${login.id}-${reason}`} className="badge badge-yellow">
                      {describeSuspiciousReason(reason)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
