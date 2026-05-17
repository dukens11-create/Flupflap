'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  SELLER_LISTINGS_NAV_ITEMS,
  SELLER_LISTINGS_ROUTE_PREFIX,
} from '@/lib/seller-listings-config';

export default function SellerListingsSectionNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(true);
  const parentActive = useMemo(
    () => pathname === SELLER_LISTINGS_ROUTE_PREFIX || pathname.startsWith(`${SELLER_LISTINGS_ROUTE_PREFIX}/`),
    [pathname],
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`flex w-full items-center justify-between gap-3 text-left ${
          parentActive ? 'text-slate-900' : 'text-slate-700'
        }`}
        aria-expanded={open}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Seller Workspace</p>
          <h2 className="mt-1 text-lg font-bold">My Listings</h2>
        </div>
        <span className={`rounded-full border border-slate-200 p-2 transition-transform ${open ? 'rotate-180' : ''}`}>
          <ChevronDown size={16} />
        </span>
      </button>

      {open && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {SELLER_LISTINGS_NAV_ITEMS.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold transition-colors ${
                  active
                    ? 'border-[var(--ff-primary-navy)] bg-slate-900 text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
