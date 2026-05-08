'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { dollars } from '@/lib/money';

type OfferRecord = {
  id: string;
  amountCents: number;
  message: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
  respondedAt: string | null;
  product: {
    id: string;
    title: string;
    imageUrl: string;
    priceCents: number;
    status: string;
  };
  buyer?: {
    id: string;
    name: string;
  };
  seller?: {
    id: string;
    name: string;
  };
};

function statusBadge(status: OfferRecord['status']) {
  if (status === 'ACCEPTED') return 'badge-green';
  if (status === 'REJECTED') return 'badge-red';
  return 'badge-yellow';
}

function OfferCard({
  offer,
  mode,
  onRespond,
  respondingId,
}: {
  offer: OfferRecord;
  mode: 'received' | 'sent';
  onRespond: (offerId: string, action: 'accept' | 'reject') => Promise<void>;
  respondingId: string | null;
}) {
  return (
    <div className="card p-4">
      <div className="flex gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={offer.product.imageUrl}
          alt={offer.product.title}
          className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <Link href={`/products/${offer.product.id}`} className="font-semibold hover:text-blue-600">
                {offer.product.title}
              </Link>
              <p className="text-sm text-slate-500">
                Listed at {dollars(offer.product.priceCents)} · Offered {dollars(offer.amountCents)}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {mode === 'received'
                  ? `From ${offer.buyer?.name ?? 'Buyer'}`
                  : `To ${offer.seller?.name ?? 'Seller'}`} · {new Date(offer.createdAt).toLocaleString()}
              </p>
            </div>
            <span className={`badge ${statusBadge(offer.status)}`}>{offer.status}</span>
          </div>

          {offer.message && (
            <p className="mt-3 text-sm text-slate-700 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2">
              {offer.message}
            </p>
          )}

          {offer.status === 'PENDING' && mode === 'received' && (
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className="btn-primary"
                disabled={respondingId === offer.id}
                onClick={() => onRespond(offer.id, 'accept')}
              >
                {respondingId === offer.id ? 'Saving…' : 'Accept'}
              </button>
              <button
                type="button"
                className="btn-outline"
                disabled={respondingId === offer.id}
                onClick={() => onRespond(offer.id, 'reject')}
              >
                Decline
              </button>
            </div>
          )}

          {offer.status === 'ACCEPTED' && (
            <p className="mt-3 text-xs text-green-700">
              Accepted offers are surfaced in notifications so you can continue the conversation and finalize details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OffersPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [received, setReceived] = useState<OfferRecord[]>([]);
  const [sent, setSent] = useState<OfferRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/offers');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError('Failed to load offers.');
        return;
      }
      const data = await res.json();
      setReceived(data.received);
      setSent(data.sent);
    } catch {
      setError('Failed to load offers.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      load();
    }
  }, [load, router, status]);

  async function handleRespond(offerId: string, action: 'accept' | 'reject') {
    setRespondingId(offerId);
    setError('');
    try {
      const res = await fetch(`/api/offers/${offerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to update offer.');
      } else {
        await load();
        router.refresh();
      }
    } catch {
      setError('Failed to update offer.');
    } finally {
      setRespondingId(null);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <main className="max-w-4xl mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!session?.user) return null;

  return (
    <main className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-black">Offers</h1>
        <p className="text-sm text-slate-500 mt-1">
          Review buyer offers and keep both sides informed through in-app notifications.
        </p>
      </div>

      {error && (
        <div className="card p-4 border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Received offers</h2>
          <span className="text-sm text-slate-500">{received.length} total</span>
        </div>
        {received.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            No buyers have sent you an offer yet.
          </div>
        ) : (
          <div className="space-y-3">
            {received.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                mode="received"
                onRespond={handleRespond}
                respondingId={respondingId}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-xl font-bold">Sent offers</h2>
          <span className="text-sm text-slate-500">{sent.length} total</span>
        </div>
        {sent.length === 0 ? (
          <div className="card p-6 text-sm text-slate-500">
            You haven't sent any offers yet. Browse listings to make one.
          </div>
        ) : (
          <div className="space-y-3">
            {sent.map((offer) => (
              <OfferCard
                key={offer.id}
                offer={offer}
                mode="sent"
                onRespond={handleRespond}
                respondingId={respondingId}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
