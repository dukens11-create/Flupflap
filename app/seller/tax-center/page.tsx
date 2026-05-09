import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import type { Metadata } from 'next';
import TaxCenterClient from './TaxCenterClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Tax Center — FlupFlap' };

export default async function SellerTaxCenterPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  return <TaxCenterClient />;
}
