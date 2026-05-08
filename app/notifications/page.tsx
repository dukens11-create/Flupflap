'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

type NotificationItem = {
  id: string;
  type: 'ORDER_UPDATE' | 'OFFER' | 'MESSAGE' | 'PAYOUT' | 'SHIPPING';
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

function timeAgo(dateStr: string) {
  const date = new Date(dateStr);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const TYPE_LABELS: Record<NotificationItem['type'], string> = {
  ORDER_UPDATE: 'Order update',
  OFFER: 'Offer',
  MESSAGE: 'Message',
  PAYOUT: 'Payout',
  SHIPPING: 'Shipping',
};

export default function NotificationsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const unreadCount = useMemo(
    () => items.filter((item) => !item.readAt).length,
    [items],
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.status === 401) {
        router.push('/login');
        return;
      }
      if (!res.ok) {
        setError('Failed to load notifications.');
        return;
      }

      const data = await res.json();
      setItems(data.notifications);

      if (data.unreadCount > 0) {
        await fetch('/api/notifications', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markAllRead: true }),
        });
        setItems((current) =>
          current.map((item) => ({
            ...item,
            readAt: item.readAt ?? new Date().toISOString(),
          })),
        );
      }
    } catch {
      setError('Failed to load notifications.');
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

  if (status === 'loading' || loading) {
    return (
      <main className="max-w-3xl mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (!session?.user) return null;

  return (
    <main className="max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-black">Notifications</h1>
          <p className="text-sm text-slate-500">
            Order, shipping, message, payout, and offer activity for your account.
          </p>
        </div>
        <div className="text-sm text-slate-500">
          {items.length === 0 ? 'No notifications yet' : `${items.length} total`}
          {items.length > 0 && unreadCount === 0 ? ' · all caught up' : ''}
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-4 border-red-200 bg-red-50 text-sm text-red-700">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card p-8 text-center text-slate-500">
          <p className="text-lg font-medium mb-2">You're all caught up</p>
          <p className="text-sm mb-4">
            We'll show marketplace updates here when an order changes, a seller replies, or an offer needs your attention.
          </p>
          <div className="flex justify-center gap-3">
            <Link href="/" className="btn-primary">Browse listings</Link>
            <Link href="/orders" className="btn-outline">View orders</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const card = (
              <div
                className={`card p-4 transition-colors ${item.readAt ? '' : 'border-blue-200 bg-blue-50'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="badge badge-slate">{TYPE_LABELS[item.type]}</span>
                      {!item.readAt && <span className="badge badge-blue">New</span>}
                    </div>
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{item.body}</p>
                  </div>
                  <span className="text-xs text-slate-400 whitespace-nowrap">
                    {timeAgo(item.createdAt)}
                  </span>
                </div>
              </div>
            );

            return item.link ? (
              <Link key={item.id} href={item.link} className="block hover:opacity-95">
                {card}
              </Link>
            ) : (
              <div key={item.id}>{card}</div>
            );
          })}
        </div>
      )}
    </main>
  );
}
