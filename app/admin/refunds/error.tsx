'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function AdminRefundsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'AdminRefundsError' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-5xl" aria-hidden="true">⚠️</p>
      <h2 className="mt-4 text-2xl font-black text-slate-800">Refund dashboard error</h2>
      <p className="mt-3 text-sm text-slate-500">
        Something went wrong loading the admin refunds page. Please try again.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={reset} className="btn-primary">Try again</button>
        <Link href="/admin" className="btn-outline">Admin home</Link>
      </div>
    </main>
  );
}
