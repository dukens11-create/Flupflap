import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function AdminWholesalersPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const wholesalers = await prisma.supplierProfile.findMany({
    include: {
      user: { select: { id: true, name: true, email: true } },
      _count: { select: { operationLogs: true, supplierProducts: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <h1 className="text-3xl font-black">Wholesaler Approvals</h1>
      <p className="text-sm text-slate-600">Approve wholesalers before their products can be publicly listed.</p>

      <div className="space-y-3">
        {wholesalers.map((profile) => (
          <article key={profile.id} className="card p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div>
              <p className="font-semibold">{profile.displayName}</p>
              <p className="text-sm text-slate-600">{profile.user.email}</p>
              <p className="text-xs text-slate-500">Status: {profile.status}</p>
              <p className="text-xs text-slate-500">Catalog items: {profile._count.supplierProducts} · Logged errors: {profile._count.operationLogs}</p>
            </div>
            <form action="/api/admin/wholesalers" method="post" className="flex gap-2 items-center">
              <input type="hidden" name="supplierProfileId" value={profile.id} />
              <select name="status" defaultValue={profile.status} className="border rounded px-2 py-1">
                <option value="PENDING">PENDING</option>
                <option value="APPROVED">APPROVED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="SUSPENDED">SUSPENDED</option>
              </select>
              <button type="submit" className="px-3 py-1.5 rounded bg-slate-900 text-white text-sm">Update</button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
