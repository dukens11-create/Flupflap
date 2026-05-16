import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { expireGarageSales } from '@/lib/garage-sales';

export const dynamic = 'force-dynamic';

export default async function ArchivedGarageSalesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=/garage-sales/archived');
  }

  await expireGarageSales();

  const sales = await prisma.garageSale.findMany({
    where: {
      sellerId: session.user.id,
      OR: [
        { status: 'EXPIRED' },
        { isArchived: true },
      ],
    },
    orderBy: { archivedAt: 'desc' },
    take: 100,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Archived Garage Sales</h1>
          <p className="mt-1 text-sm text-slate-500">Expired listings are hidden from public search. Repost any listing with one click.</p>
        </div>
        <Link href="/garage-sales" className="btn-outline text-sm">← Back to Garage Sales</Link>
      </div>

      {sales.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">No archived garage sales yet.</div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <div key={sale.id} className="card p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Link href={`/garage-sales/${sale.id}`} className="font-semibold text-slate-900 hover:underline">{sale.title}</Link>
                  <p className="text-xs text-slate-500">{sale.city}, {sale.state} · Ended {sale.endDate.toLocaleDateString()}</p>
                </div>
                <form action={`/api/garage-sales/${sale.id}/repost`} method="POST">
                  <button type="submit" className="btn-brand text-xs">Repost &amp; Pay Again</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
