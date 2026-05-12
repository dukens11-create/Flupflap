export default function CartLoading() {
  return (
    <main className="max-w-3xl mx-auto py-16" aria-live="polite" aria-busy="true">
      <div className="card p-8 text-center space-y-3">
        <p className="text-2xl" aria-hidden="true">⏳</p>
        <p className="font-semibold text-slate-800">Loading your cart…</p>
        <p className="text-sm text-slate-500">Please wait.</p>
        <p className="sr-only">Loading cart</p>
      </div>
    </main>
  );
}
