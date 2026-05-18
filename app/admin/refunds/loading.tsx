export default function AdminRefundsLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6" aria-live="polite" aria-busy="true">
      <div className="card p-8 text-center">
        <p className="text-2xl" aria-hidden="true">💸</p>
        <h1 className="mt-3 text-2xl font-black text-slate-900">Loading refund dashboard…</h1>
        <p className="mt-2 text-sm text-slate-500">Fetching the latest refund requests for review.</p>
      </div>
    </main>
  );
}
