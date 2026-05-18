import Link from 'next/link';

export default function AdminRefundsNotFound() {
  return (
    <main className="mx-auto max-w-md py-16 text-center">
      <p className="mb-4 text-5xl" aria-hidden="true">🔎</p>
      <h2 className="mb-3 text-2xl font-black text-slate-800">Refund dashboard not found</h2>
      <p className="mb-6 text-slate-500">
        The admin refund dashboard you requested could not be found.
      </p>
      <Link href="/admin" className="btn-primary">Back to admin</Link>
    </main>
  );
}
