export default function AdminRefundsLoading() {
  return (
    <main className="mx-auto max-w-7xl space-y-6" aria-live="polite" aria-busy="true">
      <div className="space-y-2">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="h-8 w-72 rounded bg-slate-200" />
        <div className="h-4 w-full max-w-xl rounded bg-slate-100" />
      </div>

      <div className="card space-y-4 p-6">
        <div className="h-6 w-48 rounded bg-slate-200" />
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <div className="h-4 w-32 rounded bg-slate-200" />
              <div className="h-4 w-48 rounded bg-slate-100" />
              <div className="h-20 rounded bg-slate-100" />
              <div className="h-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
