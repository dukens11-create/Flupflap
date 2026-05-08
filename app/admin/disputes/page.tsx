import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import Link from 'next/link';
import type { Metadata } from 'next';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  disputeStatusBadge,
  disputeStatusLabel,
  refundStatusBadge,
  refundStatusLabel,
} from '@/lib/disputes';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Order Disputes — Admin' };

const VALID_STATUSES = ['OPEN', 'UNDER_REVIEW', 'RESOLVED'] as const;

export default async function AdminDisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; update?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role !== 'ADMIN') redirect('/');

  const sp = await searchParams;
  const activeStatus = VALID_STATUSES.includes((sp.status ?? 'OPEN') as (typeof VALID_STATUSES)[number])
    ? (sp.status ?? 'OPEN')
    : 'OPEN';

  const [disputes, openCount, reviewCount, resolvedCount] = await Promise.all([
    prisma.orderItemDispute.findMany({
      where: { status: activeStatus as any },
      include: {
        buyer: { select: { id: true, name: true } },
        seller: { select: { id: true, name: true } },
        admin: { select: { name: true } },
        orderItem: {
          include: {
            order: { select: { id: true, status: true } },
            product: { select: { id: true, title: true, imageUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.orderItemDispute.count({ where: { status: 'OPEN' } }),
    prisma.orderItemDispute.count({ where: { status: 'UNDER_REVIEW' } }),
    prisma.orderItemDispute.count({ where: { status: 'RESOLVED' } }),
  ]);

  return (
    <main className="max-w-5xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Order Disputes</h1>
          <p className="text-sm text-slate-500">Review refund requests, seller responses, and buyer evidence.</p>
        </div>
        <Link href="/admin" className="btn-outline text-sm">← Admin Dashboard</Link>
      </div>

      {sp.update === 'success' && (
        <div className="card p-4 mb-4 bg-green-50 border-green-200 text-green-800 text-sm">
          Dispute resolution saved.
        </div>
      )}
      {['invalid', 'error', 'not-found'].includes(sp.update ?? '') && (
        <div className="card p-4 mb-4 bg-red-50 border-red-200 text-red-800 text-sm">
          {sp.update === 'invalid' && 'Please review the dispute action and notes.'}
          {sp.update === 'not-found' && 'We could not find that dispute.'}
          {sp.update === 'error' && 'We could not save that dispute resolution.'}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {[
          { value: 'OPEN', label: 'Open', count: openCount },
          { value: 'UNDER_REVIEW', label: 'Under review', count: reviewCount },
          { value: 'RESOLVED', label: 'Resolved', count: resolvedCount },
        ].map((tab) => (
          <Link
            key={tab.value}
            href={`/admin/disputes?status=${tab.value}`}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              activeStatus === tab.value
                ? 'bg-slate-900 text-white border-slate-900'
                : 'border-slate-300 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
            {tab.count > 0 && <span className="ml-1.5 text-xs">({tab.count})</span>}
          </Link>
        ))}
      </div>

      {disputes.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          <p className="text-2xl mb-2">✓</p>
          <p className="font-semibold">No {activeStatus.toLowerCase().replace('_', ' ')} disputes.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={disputeStatusBadge(dispute.status)}>{disputeStatusLabel(dispute.status)}</span>
                    <span className={refundStatusBadge(dispute.refundStatus)}>{refundStatusLabel(dispute.refundStatus)}</span>
                  </div>
                  <p className="text-sm text-slate-500 mt-2">
                    Buyer: <Link href={`/admin/users/${dispute.buyer.id}`} className="hover:underline">{dispute.buyer.name}</Link>
                    {' '}· Seller: <Link href={`/admin/users/${dispute.seller.id}`} className="hover:underline">{dispute.seller.name}</Link>
                    {' '}· Order #{dispute.orderItem.order.id.slice(-8).toUpperCase()}
                  </p>
                </div>
                <Link href={`/orders/${dispute.orderItem.order.id}`} className="text-sm text-blue-600 hover:underline">
                  View order
                </Link>
              </div>

              <div className="flex gap-3 items-start rounded-2xl bg-slate-50 p-4 mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={dispute.orderItem.product.imageUrl}
                  alt={dispute.orderItem.product.title}
                  className="w-16 h-16 rounded-xl object-cover"
                />
                <div>
                  <p className="font-semibold text-slate-900">{dispute.orderItem.product.title}</p>
                  <p className="text-sm text-slate-700 mt-1">{dispute.description}</p>
                </div>
              </div>

              {dispute.evidenceUrls.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {dispute.evidenceUrls.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="Dispute evidence" className="h-24 w-full rounded-xl object-cover" />
                  ))}
                </div>
              )}

              {dispute.sellerResponse && (
                <div className="rounded-xl border border-slate-200 p-4 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seller response</p>
                  <p className="mt-1 text-sm text-slate-700">{dispute.sellerResponse}</p>
                </div>
              )}

              {dispute.status === 'RESOLVED' && dispute.adminNotes && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    Resolution{dispute.admin?.name ? ` · ${dispute.admin.name}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-blue-900">{dispute.adminNotes}</p>
                </div>
              )}

              {dispute.status !== 'RESOLVED' && (
                <form action={`/api/admin/disputes/${dispute.id}/resolve`} method="POST" className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="label">Decision</label>
                    <select name="action" className="input" required>
                      <option value="approve_refund">Approve refund</option>
                      <option value="decline_refund">Decline refund</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Internal notes</label>
                    <textarea
                      name="adminNotes"
                      className="input h-24 resize-none"
                      maxLength={2000}
                      placeholder="Summarize the evidence and the final decision."
                    />
                  </div>
                  <button type="submit" className="btn-primary text-sm">Save decision</button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
