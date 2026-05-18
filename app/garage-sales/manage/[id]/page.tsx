import { getServerSession } from 'next-auth';
import { notFound, redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth-options';
import { resolveGarageSaleByRouteParam } from '@/lib/garage-sales';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ payment?: string }>;
};

export const dynamic = 'force-dynamic';

export default async function GarageSaleManageRedirectPage({ params, searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    const { id } = await params;
    redirect(`/login?callbackUrl=${encodeURIComponent(`/garage-sales/manage/${id}`)}`);
  }

  const { id } = await params;
  const sp = await searchParams;
  const sale = await resolveGarageSaleByRouteParam(id, 'garage-sales/manage/[id]');
  if (!sale) notFound();

  const isOwner = session.user.id === sale.sellerId;
  const isAdmin = session.user.role === 'ADMIN';
  if (!isOwner && !isAdmin) notFound();

  if (sp.payment === 'cancelled') {
    const query = new URLSearchParams({ saleId: sale.id, payment: 'cancelled' });
    redirect(`/seller/garage-sales?${query.toString()}`);
  }

  redirect(`/garage-sales/${sale.id}`);
}
