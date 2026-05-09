'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type TaxProfile = {
  legalName: string | null;
  businessName: string | null;
  taxIdStatus: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  stripeAccountId: string | null;
  verificationStatus: string | null;
};

type TaxSummary = {
  taxYear: number;
  grossSalesCents: number;
  totalOrders: number;
  refundsCents: number;
  marketplaceFeesCents: number;
  paymentFeesCents: number;
  netPayoutsCents: number;
  salesTaxCollectedCents: number;
  form1099Status: string;
  form1099DownloadUrl: string | null;
};

type TaxCenterData = {
  taxProfile: TaxProfile;
  summary: TaxSummary;
  availableYears: number[];
};

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function taxIdStatusLabel(status: string) {
  const map: Record<string, string> = {
    PROVIDED: 'On file',
    PENDING: 'Pending verification',
    NOT_PROVIDED: 'Not provided',
  };
  return map[status] ?? status;
}

function verificationStatusBadgeClass(status: string | null) {
  if (status === 'APPROVED') return 'badge badge-green';
  if (status === 'PENDING') return 'badge badge-yellow';
  if (status === 'REJECTED') return 'badge badge-red';
  return 'badge badge-slate';
}

function form1099StatusBadgeClass(status: string) {
  if (status === 'AVAILABLE' || status === 'FILED') return 'badge badge-green';
  if (status === 'PENDING') return 'badge badge-yellow';
  return 'badge badge-slate';
}

function form1099StatusLabel(status: string) {
  const map: Record<string, string> = {
    NOT_ELIGIBLE: 'Not eligible',
    PENDING: 'Pending',
    AVAILABLE: 'Available',
    FILED: 'Filed',
  };
  return map[status] ?? status;
}

function SummaryRow({
  label,
  value,
  sub,
  negative,
}: {
  label: string;
  value: string;
  sub?: string;
  negative?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
      <p
        className={`text-sm font-semibold tabular-nums ${negative ? 'text-red-600' : 'text-slate-900'}`}
      >
        {value}
      </p>
    </div>
  );
}

export default function TaxCenterClient() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [data, setData] = useState<TaxCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    fetch(`/api/seller/tax-center?year=${selectedYear}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: TaxCenterData) => {
        setData(json);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message ?? 'Failed to load tax data.');
        setLoading(false);
      });
  }, [selectedYear]);

  return (
    <main className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black">Tax Center</h1>
          <p className="text-slate-500 text-sm">
            Seller tax profile and annual tax reporting
          </p>
        </div>
        <Link href="/seller" className="btn-outline text-sm">
          ← Dashboard
        </Link>
      </div>

      {/* Disclaimer */}
      <div className="card p-4 mb-6 bg-amber-50 border-amber-200 text-amber-900 text-sm">
        ⚠️ FlupFlap does not provide tax advice. Sellers should consult a tax
        professional for filing guidance and to determine their specific tax
        obligations.
      </div>

      {loading && (
        <div className="card p-8 text-center text-slate-500 text-sm mb-6">
          Loading tax data…
        </div>
      )}

      {error && (
        <div className="card p-4 mb-6 bg-red-50 border-red-200 text-red-800 text-sm">
          ❌ {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Tax Profile ── */}
          <section className="card p-6 mb-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 className="text-lg font-bold">Seller Tax Profile</h2>
              <a href="/account" className="btn-outline text-xs">
                Update Tax Information
              </a>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Legal Name
                </p>
                <p className="text-sm text-slate-800">
                  {data.taxProfile.legalName ?? (
                    <span className="text-slate-400 italic">Not provided</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Business Name
                </p>
                <p className="text-sm text-slate-800">
                  {data.taxProfile.businessName ?? (
                    <span className="text-slate-400 italic">Not provided</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Tax ID Status
                </p>
                <p className="text-sm text-slate-800">
                  {taxIdStatusLabel(data.taxProfile.taxIdStatus)}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Verification Status
                </p>
                <span
                  className={verificationStatusBadgeClass(
                    data.taxProfile.verificationStatus,
                  )}
                >
                  {data.taxProfile.verificationStatus ?? 'Not started'}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Address
                </p>
                <p className="text-sm text-slate-800">
                  {data.taxProfile.addressLine1 ? (
                    <>
                      {data.taxProfile.addressLine1}
                      {data.taxProfile.addressLine2 && (
                        <>, {data.taxProfile.addressLine2}</>
                      )}
                      <br />
                      {data.taxProfile.city}, {data.taxProfile.state}{' '}
                      {data.taxProfile.postalCode}
                      <br />
                      {data.taxProfile.country}
                    </>
                  ) : (
                    <span className="text-slate-400 italic">Not provided</span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                  Stripe Connect Account
                </p>
                <p className="text-sm font-mono text-slate-700">
                  {data.taxProfile.stripeAccountId ? (
                    <span className="text-slate-600">
                      {data.taxProfile.stripeAccountId}
                    </span>
                  ) : (
                    <span className="text-slate-400 italic">
                      Not connected —{' '}
                      <a
                        href="/api/stripe/connect"
                        className="text-blue-600 hover:underline not-italic"
                      >
                        Connect Stripe
                      </a>
                    </span>
                  )}
                </p>
              </div>
            </div>
          </section>

          {/* ── Year Selector + Tax Report ── */}
          <section className="card p-6 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <h2 className="text-lg font-bold">Annual Tax Summary</h2>
              <div className="flex items-center gap-2">
                <label
                  htmlFor="tax-year-select"
                  className="text-sm text-slate-600"
                >
                  Tax year:
                </label>
                <select
                  id="tax-year-select"
                  className="input text-sm max-w-[120px]"
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                >
                  {(data.availableYears.length > 0
                    ? data.availableYears
                    : [currentYear]
                  ).map(y => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 mb-5">
              <SummaryRow
                label="Gross Sales"
                value={dollars(data.summary.grossSalesCents)}
                sub="Before fees and refunds"
              />
              <SummaryRow
                label="Total Orders"
                value={String(data.summary.totalOrders)}
                sub="Completed / paid orders"
              />
              <SummaryRow
                label="Refunds"
                value={`−${dollars(data.summary.refundsCents)}`}
                sub="Refunded order subtotals"
                negative
              />
              <SummaryRow
                label="FlupFlap Commission Fees"
                value={`−${dollars(data.summary.marketplaceFeesCents)}`}
                sub="Platform commission deducted"
                negative
              />
              <SummaryRow
                label="Stripe / Payment Fees (est.)"
                value={`−${dollars(data.summary.paymentFeesCents)}`}
                sub="2.9% + $0.30 per order estimate"
                negative
              />
              <SummaryRow
                label="Net Payout Estimate"
                value={dollars(data.summary.netPayoutsCents)}
                sub="After all fees"
              />
              <SummaryRow
                label="Sales Tax Collected"
                value={dollars(data.summary.salesTaxCollectedCents)}
                sub="Collected on behalf of buyer"
              />
            </div>

            <div className="flex flex-wrap gap-3">
              <a
                href={`/api/seller/tax-center/csv?year=${selectedYear}`}
                download
                className="btn-outline text-sm"
              >
                ↓ Download CSV Report
              </a>
              <a
                href={`/api/seller/tax-center/pdf?year=${selectedYear}`}
                download
                className="btn-outline text-sm"
              >
                ↓ Download PDF Statement
              </a>
            </div>
          </section>

          {/* ── 1099-K Section ── */}
          <section className="card p-6 mb-6">
            <h2 className="text-lg font-bold mb-4">1099-K Tax Form</h2>

            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span
                className={form1099StatusBadgeClass(
                  data.summary.form1099Status,
                )}
              >
                {form1099StatusLabel(data.summary.form1099Status)}
              </span>
              <span className="text-sm text-slate-500">
                Tax year: {selectedYear}
              </span>
            </div>

            {(data.summary.form1099Status === 'AVAILABLE' ||
              data.summary.form1099Status === 'FILED') &&
              data.summary.form1099DownloadUrl && (
                <a
                  href={data.summary.form1099DownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-primary text-sm mb-4 inline-block"
                >
                  ↓ Download 1099-K Form
                </a>
              )}

            <p className="text-xs text-slate-500 mt-2">
              1099-K forms are generated and filed through Stripe Connect when
              required. You will be notified when your form is available.
              {!data.taxProfile.stripeAccountId && (
                <>{' '}Connect your Stripe account to enable 1099-K reporting.</>
              )}
            </p>
          </section>
        </>
      )}
    </main>
  );
}
