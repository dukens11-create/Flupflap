import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Promotion Active!' };

export default async function PromoteSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { id } = await params;
  const { session_id } = await searchParams;

  return (
    <main className="max-w-md mx-auto text-center py-16">
      <div className="card p-10">
        <p className="text-5xl mb-4">⭐</p>
        <h1 className="text-3xl font-black mb-2">Promotion active!</h1>
        <p className="text-slate-500 mb-6">
          Your listing will become active as soon as Stripe confirms the payment. Buyers will see it higher in results with a Sponsored badge while the boost is active.
        </p>
        {session_id && (
          <p className="text-xs font-mono text-slate-400 mb-6 break-all">Ref: {session_id}</p>
        )}
        <div className="flex flex-col gap-3">
          <Link href={`/products/${id}`} className="btn-primary">View listing</Link>
          <Link href="/seller" className="btn-outline">Back to dashboard</Link>
        </div>
      </div>
    </main>
  );
}
