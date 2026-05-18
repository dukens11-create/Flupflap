import Link from 'next/link';

export default function AdminRefundsNotFound() {
  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-xl flex-col justify-center px-4 py-16 text-center sm:px-6">
      <p className="text-5xl" aria-hidden="true">🧾</p>
      <h2 className="mt-4 text-2xl font-black text-slate-800">Refund page not found</h2>
      <p className="mt-3 text-sm text-slate-500">
        The admin refunds dashboard could not be found. Return to the admin home page to continue.
      </p>
      <div className="mt-6">
        <Link href="/admin" className="btn-outline">Back to admin</Link>
      </div>
    </main>
  );
}
