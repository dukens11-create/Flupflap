'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function AccountError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { boundary: 'AccountError' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <main className="max-w-md mx-auto py-16 text-center">
      <p className="text-5xl mb-4">👤</p>
      <h2 className="text-2xl font-black mb-3 text-slate-800">Account page unavailable</h2>
      <p className="text-slate-500 mb-6">
        Something went wrong loading your account. Please try again.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button onClick={reset} className="btn-primary">Try again</button>
        <Link href="/" className="btn-outline">Go home</Link>
      </div>
    </main>
  );
}
