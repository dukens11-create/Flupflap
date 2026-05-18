import Link from 'next/link';

export default function AdminRefundsNotFound() {
  return (
    <main className="max-w-md mx-auto py-16 text-center">
      <p className="text-5xl mb-4">🧾</p>
      <h1 className="text-2xl font-black mb-3 text-slate-800">Refunds page not found</h1>
      <p className="text-slate-500 mb-6">The admin refunds page is not available.</p>
      <Link href="/admin" className="btn-primary">Go to admin dashboard</Link>
    </main>
  );
}
