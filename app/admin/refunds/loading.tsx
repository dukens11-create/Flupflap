export default function AdminRefundsLoading() {
  return (
    <main className="max-w-5xl mx-auto py-16" aria-live="polite" aria-busy="true">
      <div className="card p-8 text-center space-y-3">
        <p className="text-2xl" aria-hidden="true">⏳</p>
        <p className="font-semibold text-slate-800">Loading refunds dashboard…</p>
        <p className="text-sm text-slate-500">Please wait.</p>
      </div>
    </main>
  );
}
