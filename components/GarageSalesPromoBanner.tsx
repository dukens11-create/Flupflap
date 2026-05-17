'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X } from 'lucide-react';

const DISMISS_KEY = 'ff_garage_sales_banner_dismissed';

export default function GarageSalesPromoBanner() {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISS_KEY) === '1') {
      setDismissed(true);
    }
  }, []);

  function handleDismiss() {
    setDismissed(true);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DISMISS_KEY, '1');
    }
  }

  function handleBannerClick() {
    void fetch('/api/analytics/banner-click', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'garage_sales_banner_click',
        placement: 'buyer_homepage',
        destination: '/garage-sales/create',
      }),
      keepalive: true,
    }).catch(() => null);
  }

  if (dismissed) return null;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md">
      <Link
        href="/garage-sales/create"
        onClick={handleBannerClick}
        className="absolute inset-0 z-10 rounded-[28px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ff-primary-navy)] focus-visible:ring-offset-2"
        aria-label="Open Garage Sales creation page"
      >
        <span className="sr-only">Post Your Garage Sale</span>
      </Link>

      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 z-20 inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/90 text-slate-600 shadow-sm transition hover:bg-white sm:hidden"
        aria-label="Dismiss garage sales banner"
      >
        <X size={16} />
      </button>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.2fr_1fr] lg:items-center lg:gap-6 lg:p-6">
        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-700">Garage Sales</p>
          <h2 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">Turn your neighborhood sale into more traffic</h2>
          <p className="text-sm leading-6 text-slate-600 sm:text-base">
            Reach local buyers before your event starts and share your best finds.
          </p>
          <span className="btn-brand inline-flex">Post Your Garage Sale</span>
        </div>

        <div className="relative h-44 w-full overflow-hidden rounded-2xl bg-slate-50 p-2 shadow-inner sm:h-56 lg:h-64">
          <Image
            src="/garage-sales-promo.svg"
            alt="Garage Sales promotional banner"
            fill
            className="object-contain"
            loading="lazy"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 40vw"
          />
        </div>
      </div>
    </section>
  );
}
