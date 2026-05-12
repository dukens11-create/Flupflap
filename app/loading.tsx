export default function GlobalLoading() {
  return (
    <main className="max-w-2xl mx-auto py-16" aria-live="polite" aria-busy="true">
      <div className="card p-8 text-center space-y-3">
        <p className="text-2xl" aria-hidden="true">⏳</p>
        <p className="font-semibold text-slate-800">Loading…</p>
        <p className="text-sm text-slate-500">Please wait while we prepare this page.</p>
        <p className="sr-only">Loading page content</p>
      </div>
    </main>
  );
}
