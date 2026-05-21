import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { dollars } from '@/lib/money';

export const dynamic = 'force-dynamic';

export default async function SupplierDashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'SELLER') redirect('/');

  const profile = await prisma.supplierProfile.findUnique({
    where: { userId: session.user.id },
  });

  if (!profile) {
    return (
      <main className="max-w-4xl mx-auto p-6 space-y-4">
        <h1 className="text-2xl font-bold">Supplier Dashboard</h1>
        <p className="text-sm text-slate-600">No supplier profile is connected to this account yet. Start onboarding below.</p>
        <form action="/api/supplier/profile" method="post" className="card p-4 space-y-3 max-w-lg">
          <label htmlFor="supplier-display-name" className="block text-sm">Display name
            <input id="supplier-display-name" name="displayName" className="mt-1 w-full border rounded px-3 py-2" required />
          </label>
          <label htmlFor="supplier-company-name" className="block text-sm">Company name
            <input id="supplier-company-name" name="companyName" className="mt-1 w-full border rounded px-3 py-2" />
          </label>
          <button type="submit" className="px-4 py-2 rounded bg-slate-900 text-white">Create supplier profile</button>
        </form>
      </main>
    );
  }

  const [catalogCount, imports, syncRuns, routings, payouts, logs] = await Promise.all([
    prisma.supplierProduct.count({ where: { supplierId: profile.id } }),
    prisma.supplierImportRun.findMany({ where: { supplierId: profile.id }, orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.supplierSyncRun.findMany({ where: { supplierId: profile.id }, orderBy: { startedAt: 'desc' }, take: 10 }),
    prisma.supplierOrderRouting.findMany({ where: { supplierUserId: session.user.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.supplierPayout.findMany({ where: { routing: { supplierUserId: session.user.id } }, orderBy: { createdAt: 'desc' }, take: 20 }),
    prisma.supplierOperationLog.findMany({ where: { supplierId: profile.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  const pendingPayoutCents = payouts.filter((p) => p.status !== 'PAID').reduce((sum, p) => sum + p.supplierAmountCents, 0);
  const paidPayoutCents = payouts.filter((p) => p.status === 'PAID').reduce((sum, p) => sum + p.supplierAmountCents, 0);

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-8">
      <section className="space-y-2">
        <h1 className="text-3xl font-black">Supplier Dashboard</h1>
        <p className="text-sm text-slate-600">Manage wholesaler onboarding, catalog imports, routed orders, and payouts.</p>
      </section>

      <section className="grid md:grid-cols-4 gap-4">
        <div className="card p-4"><p className="text-xs text-slate-500">Profile status</p><p className="text-xl font-bold">{profile.status}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Catalog products</p><p className="text-xl font-bold">{catalogCount}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Pending payouts</p><p className="text-xl font-bold">{dollars(pendingPayoutCents)}</p></div>
        <div className="card p-4"><p className="text-xs text-slate-500">Paid payouts</p><p className="text-xl font-bold">{dollars(paidPayoutCents)}</p></div>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-bold text-lg">CSV import</h2>
        <form action="/api/supplier/import/csv" method="post" encType="multipart/form-data" className="flex flex-col md:flex-row gap-3 items-start md:items-end">
          <input type="file" name="file" accept=".csv,text/csv" className="block w-full border rounded px-3 py-2" required />
          <button type="submit" className="px-4 py-2 rounded bg-slate-900 text-white">Import CSV</button>
        </form>
      </section>

      <section className="card p-4 space-y-3">
        <h2 className="font-bold text-lg">API sync</h2>
        <form action="/api/supplier/sync/trigger" method="post">
          <input type="hidden" name="trigger" value="MANUAL" />
          <button type="submit" className="px-4 py-2 rounded bg-slate-900 text-white">Run sync now</button>
        </form>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold">Recent imports</h3>
          <ul className="space-y-1 text-sm">
            {imports.map((run) => <li key={run.id}>[{run.status}] created {run.createdCount}, updated {run.updatedCount}, failed {run.failedCount}</li>)}
            {imports.length === 0 && <li className="text-slate-500">No imports yet.</li>}
          </ul>
        </div>
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold">Recent sync runs</h3>
          <ul className="space-y-1 text-sm">
            {syncRuns.map((run) => <li key={run.id}>[{run.status}] {run.provider} — created {run.createdCount}, updated {run.updatedCount}, failed {run.failedCount}</li>)}
            {syncRuns.length === 0 && <li className="text-slate-500">No sync runs yet.</li>}
          </ul>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold">Routed supplier orders</h3>
          <ul className="space-y-1 text-sm">
            {routings.map((routing) => <li key={routing.id}>{routing.orderId} — {routing.status}</li>)}
            {routings.length === 0 && <li className="text-slate-500">No routed orders yet.</li>}
          </ul>
        </div>
        <div className="card p-4 space-y-2">
          <h3 className="font-semibold">Recent operation errors</h3>
          <ul className="space-y-1 text-sm">
            {logs.map((log) => <li key={log.id}>{log.errorCode}: {log.errorMessage}</li>)}
            {logs.length === 0 && <li className="text-slate-500">No errors logged.</li>}
          </ul>
        </div>
      </section>
    </main>
  );
}
