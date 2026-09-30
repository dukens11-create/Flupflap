import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import AirtimeAgentPanel from '@/components/AirtimeAgentPanel';

export const dynamic = 'force-dynamic';

export default async function AirtimeAgentPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login?callbackUrl=/seller/airtime-agent');
  if (session.user.role !== 'SELLER') redirect('/signup?callbackUrl=/seller/airtime-agent');

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <Link href="/seller" className="text-sm text-slate-500 hover:text-blue-600">← Back to seller dashboard</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-bold uppercase tracking-wider text-blue-600">FlupFlap Global Agent Network</p>
            <h1 className="text-3xl font-black">Airtime Agent</h1>
            <p className="mt-2 max-w-2xl text-slate-600">Sell airtime worldwide from your FlupFlap seller account, manage wallet funds, and track commissions.</p>
          </div>
        </div>
      </div>
      <AirtimeAgentPanel />
    </main>
  );
}
