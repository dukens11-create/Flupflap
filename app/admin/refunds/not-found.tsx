import Link from 'next/link';

export default function AdminRefundsNotFound() {
  return (
    <main className="mx-auto max-w-3xl py-10">
      <div className="card p-6 text-center space-y-3">
        <h2 className="text-2xl font-black text-slate-800">Refund page not found</h2>
        <p className="text-sm text-slate-500">The admin refunds page could not be found.</p>
        <Link href="/admin" className="btn-outline">Back to admin dashboard</Link>
      </div>
    </main>
  );
}
