export default function CheckoutLoading() {
  return (
    <main className="max-w-2xl mx-auto py-16" aria-live="polite" aria-busy="true">
      <div className="card p-8 text-center space-y-3">
        <p className="text-2xl" aria-hidden="true">⏳</p>
        <p className="font-semibold text-slate-800">Loading checkout…</p>
        <p className="text-sm text-slate-500">Please wait while we prepare your order.</p>
        <p className="sr-only">Loading checkout page</p>
      </div>
    </main>
  );
}
