export default function AdminRefundsLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6" aria-live="polite" aria-busy="true">
      <div className="card space-y-3 p-8 text-center">
        <p className="text-2xl" aria-hidden="true">⏳</p>
        <p className="font-semibold text-slate-800">Loading refund dashboard…</p>
        <p className="text-sm text-slate-500">Fetching refund requests and admin actions.</p>
        <p className="sr-only">Loading refund dashboard</p>
      </div>
    </main>
  );
}
