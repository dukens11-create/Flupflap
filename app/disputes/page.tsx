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
export const metadata: Metadata = { title: 'Dispute Center' };

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ update?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  if (session.user.role === 'ADMIN') redirect('/admin/disputes');

  const sp = await searchParams;
  const isSeller = session.user.role === 'SELLER';

  const disputes = await prisma.orderItemDispute.findMany({
    where: isSeller ? { sellerId: session.user.id } : { buyerId: session.user.id },
    include: {
      buyer: { select: { name: true } },
      seller: { select: { name: true } },
      admin: { select: { name: true } },
      orderItem: {
        include: {
          order: { select: { id: true, createdAt: true, status: true } },
          product: { select: { id: true, title: true, imageUrl: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">Dispute Center</h1>
          <p className="text-sm text-slate-500">
            {isSeller
              ? 'Review buyer claims, issue refunds, or send cases to FlupFlap for review.'
              : 'Track return and refund requests for your purchases.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={isSeller ? '/seller' : '/orders'} className="btn-outline text-sm">
            {isSeller ? 'Seller Dashboard' : 'My Orders'}
          </Link>
        </div>
      </div>

      {sp.update === 'success' && (
        <div className="card p-4 mb-4 bg-green-50 border-green-200 text-green-800 text-sm">
          Dispute updated successfully.
        </div>
      )}
      {['invalid', 'error', 'not-found'].includes(sp.update ?? '') && (
        <div className="card p-4 mb-4 bg-red-50 border-red-200 text-red-800 text-sm">
          {sp.update === 'invalid' && 'Please include a clear response before submitting.'}
          {sp.update === 'not-found' && 'We could not find that dispute.'}
          {sp.update === 'error' && 'We could not update that dispute. Please try again.'}
        </div>
      )}

      {disputes.length === 0 ? (
        <div className="card p-10 text-center text-slate-500">
          <p className="text-2xl mb-2">🧾</p>
          <p className="font-semibold">No disputes yet.</p>
          <p className="text-sm mt-1">
            {isSeller
              ? 'Buyer issues will appear here so you can respond quickly.'
              : 'If an order has a delivery or item problem, you can open a dispute from the order details page.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={disputeStatusBadge(dispute.status)}>{disputeStatusLabel(dispute.status)}</span>
                    <span className={refundStatusBadge(dispute.refundStatus)}>{refundStatusLabel(dispute.refundStatus)}</span>
                    <span className="text-xs text-slate-400">
                      {new Date(dispute.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Order #{dispute.orderItem.order.id.slice(-8).toUpperCase()} ·{' '}
                    {isSeller ? `Buyer: ${dispute.buyer.name}` : `Seller: ${dispute.seller.name}`}
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
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{dispute.orderItem.product.title}</p>
                  <p className="text-sm text-slate-600 mt-1">{dispute.description}</p>
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

              {dispute.adminNotes && (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                    FlupFlap review{dispute.admin?.name ? ` · ${dispute.admin.name}` : ''}
                  </p>
                  <p className="mt-1 text-sm text-blue-900">{dispute.adminNotes}</p>
                </div>
              )}

              {isSeller && dispute.status === 'OPEN' && (
                <form action={`/api/disputes/${dispute.id}/seller`} method="POST" className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label className="label">Seller response</label>
                    <textarea
                      name="sellerResponse"
                      className="input h-24 resize-none"
                      minLength={10}
                      maxLength={2000}
                      placeholder="Share what happened and how you want to resolve it."
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Next step</label>
                    <select name="action" className="input" required>
                      <option value="approve_refund">Approve refund</option>
                      <option value="needs_admin_review">Send to FlupFlap review</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary text-sm">
                    Update dispute
                  </button>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
