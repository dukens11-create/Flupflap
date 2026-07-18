'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CheckCircle, Star, Zap } from 'lucide-react';

type ProgramStatus = {
  isOpen: boolean;
  enrolledCount: number;
  limit: number;
  spotsRemaining: number;
};

type EnrollResult = {
  success?: boolean;
  foundingSellerNumber?: number;
  expiryDate?: string;
  error?: string;
};

type Props = {
  /** When provided, the "Become a Founding Seller" button enrolls inline instead of redirecting. */
  inlineEnroll?: boolean;
};

const BENEFITS = [
  'No subscription payment for 1 year',
  'No credit card required to start',
  'List and sell products',
  'Host Garage Sales',
  'Go Live with Garage Sales Live',
  'Access your Seller Dashboard',
  'Keep building your business as FlupFlap grows',
];

export default function FoundingSellerPromo({ inlineEnroll = false }: Props) {
  const [status, setStatus] = useState<ProgramStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [result, setResult] = useState<EnrollResult | null>(null);

  useEffect(() => {
    void fetch('/api/founding-seller/enroll')
      .then((r) => r.json())
      .then((data: ProgramStatus) => setStatus(data))
      .catch(() => setStatus(null))
      .finally(() => setLoading(false));
  }, []);

  async function handleEnroll() {
    if (!inlineEnroll) return;
    setEnrolling(true);
    try {
      const res = await fetch('/api/founding-seller/enroll', { method: 'POST' });
      const data: EnrollResult = await res.json();
      setResult(data);
      if (data.success) {
        // Refresh program status after successful enrollment.
        const updated = await fetch('/api/founding-seller/enroll').then((r) => r.json());
        setStatus(updated);
      }
    } catch {
      setResult({ error: 'Enrollment failed. Please try again.' });
    } finally {
      setEnrolling(false);
    }
  }

  const isClosed = !loading && status && !status.isOpen;

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
      <div className="bg-[var(--ff-primary-navy,#0f172a)] px-6 py-4 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-400">
          Limited to the first 1,000 founders
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
          🚀 Sell Free for 1 Full Year
        </h2>
        <p className="mt-1 text-sm text-slate-300">
          Join FlupFlap as one of our first 1,000 Founding Sellers
        </p>
      </div>

      <div className="p-6">
        {/* Benefits list */}
        <ul className="space-y-2">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-slate-700">
              <CheckCircle
                size={16}
                className="mt-0.5 shrink-0 text-green-500"
                aria-hidden="true"
              />
              {benefit}
            </li>
          ))}
        </ul>

        {/* Selling fee note */}
        <p className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-center text-sm text-slate-600">
          FlupFlap charges a{' '}
          <span className="font-semibold text-slate-900">7% selling fee</span> only when
          you successfully make a sale.
        </p>

        {/* After Year 1 */}
        <div className="mt-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            After your free year
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 px-4 py-3 text-center">
              <p className="text-xs font-medium text-slate-500">Garage Seller</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">$3.99/mo</p>
            </div>
            <div className="rounded-2xl border border-slate-200 px-4 py-3 text-center">
              <p className="text-xs font-medium text-slate-500">Regular Seller</p>
              <p className="mt-0.5 text-base font-bold text-slate-900">$4.99/mo</p>
            </div>
          </div>
          <p className="text-center text-xs text-slate-500">
            Your paid subscription will not begin automatically unless you choose to
            subscribe.
          </p>
        </div>

        {/* Enrollment progress */}
        {status && (
          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>{status.enrolledCount.toLocaleString()} enrolled</span>
              <span>{status.spotsRemaining.toLocaleString()} spots left</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[var(--ff-primary-navy,#0f172a)] transition-all"
                style={{
                  width: `${Math.min(100, (status.enrolledCount / status.limit) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Success state */}
        {result?.success && (
          <div className="mt-4 rounded-2xl bg-green-50 px-4 py-4 text-center">
            <Star size={24} className="mx-auto text-amber-500" aria-hidden="true" />
            <p className="mt-2 text-base font-bold text-slate-900">
              Welcome, Founder #{result.foundingSellerNumber}!
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Your free year starts now. Head to your{' '}
              <Link href="/seller" className="font-semibold text-[var(--ff-primary-navy,#0f172a)] underline">
                Seller Dashboard
              </Link>{' '}
              to get started.
            </p>
          </div>
        )}

        {/* Error state */}
        {result?.error && !result.success && (
          <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-center text-sm text-red-600">
            {result.error}
          </p>
        )}

        {/* CTA */}
        {!result?.success && (
          <div className="mt-5">
            {isClosed ? (
              <div className="rounded-2xl bg-slate-100 px-4 py-4 text-center">
                <p className="font-semibold text-slate-700">Program Closed</p>
                <p className="mt-1 text-sm text-slate-500">
                  All 1,000 founding seller spots have been claimed. Check back for
                  future seller plans.
                </p>
              </div>
            ) : inlineEnroll ? (
              <button
                type="button"
                onClick={() => void handleEnroll()}
                disabled={enrolling || loading}
                className="btn-brand w-full justify-center disabled:opacity-60"
              >
                {enrolling ? (
                  'Enrolling…'
                ) : (
                  <>
                    <Zap size={16} aria-hidden="true" />
                    BECOME A FOUNDING SELLER
                  </>
                )}
              </button>
            ) : (
              <Link
                href="/founding-seller"
                className="btn-brand flex w-full items-center justify-center gap-2"
              >
                <Zap size={16} aria-hidden="true" />
                BECOME A FOUNDING SELLER
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
