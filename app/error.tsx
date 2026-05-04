'use client';

/**
 * Global error boundary for the app.
 * Catches unhandled errors from server components, including those caused by a
 * missing DATABASE_URL. In production, set DATABASE_URL in your environment
 * (e.g. Render dashboard) for full functionality.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="max-w-2xl mx-auto py-16 text-center">
      <h2 className="text-2xl font-black mb-4 text-slate-800">Something went wrong</h2>
      <p className="text-slate-500 mb-6">
        This page could not be loaded. If this is a new deployment, make sure{' '}
        <code className="font-mono text-xs bg-slate-100 px-1 rounded">DATABASE_URL</code>{' '}
        and other required environment variables are configured.
      </p>
      <button onClick={reset} className="btn-primary">
        Try again
      </button>
    </main>
  );
}
