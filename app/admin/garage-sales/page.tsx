import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { getMarketplaceSettings } from '@/lib/commission';
import { expireGarageSales } from '@/lib/garage-sales';
import {
  getGarageSaleCompensationIneligibilityReason,
  isGarageSaleCompensationEligible,
  parseGarageSaleCompensationAudit,
} from '@/lib/garage-sale-compensation';
import AdminGarageSalesClient from './AdminGarageSalesClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Admin – Garage Sales' };

interface SearchParams {
  status?: string;
  page?: string;
  success?: string;
  error?: string;
}

export default async function AdminGarageSalesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sp = await searchParams;
  await expireGarageSales();
  const statusFilter = sp.status ?? '';
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const perPage = 50;
  const settings = await getMarketplaceSettings();

  const where: Record<string, unknown> = {};
  if (statusFilter && ['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'HIDDEN'].includes(statusFilter)) {
    where.status = statusFilter;
  }

  const [sales, total, pendingCount, expiredCount, payments] = await Promise.all([
    prisma.garageSale.findMany({
      where,
      include: {
        seller: { select: { id: true, name: true, email: true } },
        _count: { select: { reports: true, favorites: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.garageSale.count({ where }),
    prisma.garageSale.count({ where: { status: 'PENDING' } }),
    prisma.garageSale.count({ where: { status: 'EXPIRED' } }),
    prisma.garageSalePayment.aggregate({
      _sum: { amountCents: true },
      _count: { _all: true },
      where: { status: 'PAID' },
    }),
  ]);

  const totalPages = Math.ceil(total / perPage);
  const compensationNow = new Date();
  const salesWithCompensationState = sales.map((sale) => {
    const compensationGranted = Boolean(sale.adminNotes && parseGarageSaleCompensationAudit(sale.adminNotes));
    const compensationInput = {
      isLive: sale.isLive,
      isArchived: sale.isArchived,
      isSpam: sale.isSpam,
      status: sale.status,
      paymentStatus: sale.paymentStatus,
      startDate: sale.startDate,
      endDate: sale.endDate,
    };
    return {
      ...sale,
      compensationEligible: !compensationGranted && isGarageSaleCompensationEligible(compensationInput, compensationNow),
      compensationIneligibilityReason: getGarageSaleCompensationIneligibilityReason(compensationInput, compensationNow),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">🏡 Garage Sales Admin</h1>
          <p className="text-sm text-slate-500 mt-1">{total} total · {pendingCount} pending review · {expiredCount} expired</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin Dashboard</Link>
      </div>

      {sp.success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{sp.success}</div>
      )}
      {sp.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Garage sale revenue</p>
          <p className="mt-1 text-2xl font-black text-slate-900">${((payments._sum.amountCents ?? 0) / 100).toFixed(2)}</p>
          <p className="mt-1 text-xs text-slate-500">{payments._count._all} paid listing payment{payments._count._all === 1 ? '' : 's'}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current standard pricing</p>
          {settings.garageSalesFree ? (
            <p className="mt-1 text-2xl font-black text-emerald-600">FREE 🎉</p>
          ) : (
            <p className="mt-1 text-2xl font-black text-slate-900">${(settings.garageStandardPriceCents / 100).toFixed(2)}/day</p>
          )}
          <p className="mt-1 text-xs text-slate-500">Featured: ${(settings.garageFeaturedPriceCents / 100).toFixed(2)}/day</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add-ons</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">Homepage: {settings.garageHomepagePromoEnabled ? `$${(settings.garageHomepagePromoCents / 100).toFixed(2)}` : 'Disabled'}</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">Top Search: {settings.garageTopSearchEnabled ? `$${(settings.garageTopSearchCents / 100).toFixed(2)}` : 'Disabled'}</p>
          <p className="mt-1 text-xs text-slate-500">Free first listing: {settings.garageFirstListingFree ? 'On' : 'Off'}</p>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-lg font-black text-slate-900">Pricing &amp; promotion controls</h2>
        <p className="mt-1 text-xs text-slate-500">Changes apply instantly to new garage sale checkout sessions.</p>
        {settings.garageSalesFree && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            🎉 Garage sales are currently <strong>FREE</strong> for all sellers. All fees are waived.
          </div>
        )}
        <form action="/api/admin/garage-sales/pricing" method="POST" className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input type="checkbox" name="garageSalesFree" defaultChecked={settings.garageSalesFree} className="accent-[var(--ff-primary-navy)]" />
            Make all garage sales free (Go Live for Free — waives all listing fees)
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Standard listing ($/day)</span>
            <input name="garageStandardPrice" type="number" min="0" step="0.01" defaultValue={(settings.garageStandardPriceCents / 100).toFixed(2)} className="input" required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Featured listing ($/day)</span>
            <input name="garageFeaturedPrice" type="number" min="0" step="0.01" defaultValue={(settings.garageFeaturedPriceCents / 100).toFixed(2)} className="input" required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Homepage promotion ($)</span>
            <input name="garageHomepagePromoPrice" type="number" min="0" step="0.01" defaultValue={(settings.garageHomepagePromoCents / 100).toFixed(2)} className="input" required />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-semibold text-slate-700">Top local search placement ($)</span>
            <input name="garageTopSearchPrice" type="number" min="0" step="0.01" defaultValue={(settings.garageTopSearchCents / 100).toFixed(2)} className="input" required />
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="garageHomepagePromoEnabled" defaultChecked={settings.garageHomepagePromoEnabled} className="accent-[var(--ff-primary-navy)]" />
            Enable homepage promotion
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="garageTopSearchEnabled" defaultChecked={settings.garageTopSearchEnabled} className="accent-[var(--ff-primary-navy)]" />
            Enable top local search placement
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 md:col-span-2">
            <input type="checkbox" name="garageFirstListingFree" defaultChecked={settings.garageFirstListingFree} className="accent-[var(--ff-primary-navy)]" />
            Offer first garage sale listing free
          </label>
          <div className="md:col-span-2">
            <button type="submit" className="btn-brand">Save garage sale pricing</button>
          </div>
        </form>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: 'All', value: '' },
          { label: 'Pending', value: 'PENDING' },
          { label: 'Approved', value: 'APPROVED' },
          { label: 'Rejected', value: 'REJECTED' },
          { label: 'Hidden', value: 'HIDDEN' },
          { label: 'Expired', value: 'EXPIRED' },
        ].map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/garage-sales?status=${tab.value}&page=1`}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${statusFilter === tab.value ? 'border-[var(--ff-primary-navy)] bg-[var(--ff-primary-navy)] text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}
          >
            {tab.label}
            {tab.value === 'PENDING' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">{pendingCount}</span>
            )}
          </Link>
        ))}
      </div>

      <AdminGarageSalesClient
        sales={JSON.parse(JSON.stringify(salesWithCompensationState))}
        total={total}
        page={page}
        totalPages={totalPages}
        statusFilter={statusFilter}
      />
    </div>
  );
}
