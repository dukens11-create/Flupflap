import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import GarageSaleNewForm from './GarageSaleNewForm';

export const metadata: Metadata = { title: 'Post a Garage Sale | FlupFlap' };

export default async function GarageSaleNewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login?callbackUrl=/garage-sales/new');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-900">📢 Post a Garage Sale</h1>
        <p className="mt-1 text-sm text-slate-500">
          Share your garage, yard, estate, or moving sale with local buyers.
        </p>
      </div>
      <GarageSaleNewForm />
    </div>
  );
}
