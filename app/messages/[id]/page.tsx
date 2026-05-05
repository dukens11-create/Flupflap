'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

type Sender = { id: string; name: string };

type Message = {
  id: string;
  body: string;
  senderId: string;
  sender: Sender;
  createdAt: string;
  readAt: string | null;
};

type ConversationData = {
  id: string;
  buyerId: string;
  buyer: Sender;
  seller: Sender;
  product: {
    id: string;
    title: string;
    imageUrl: string;
    priceCents: number;
    status: string;
  };
  messages: Message[];
};

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = Date.now();
  const diff = now - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function dollars(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export default function ConversationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [conv, setConv] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (res.status === 401) { router.push('/login'); return; }
      if (!res.ok) { setError('Conversation not found.'); setLoading(false); return; }
      const data: ConversationData = await res.json();
      setConv(data);
    } catch {
      setError('Failed to load conversation.');
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') load();
  }, [status, load, router]);

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conv?.messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim()) return;
    setSendError('');
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) {
        const d = await res.json();
        setSendError(d.error || 'Failed to send message.');
        setSending(false);
        return;
      }
      setReply('');
      await load();
    } catch {
      setSendError('Network error. Please try again.');
    }
    setSending(false);
  }

  if (status === 'loading' || loading) {
    return (
      <main className="max-w-2xl mx-auto">
        <div className="card p-8 animate-pulse bg-slate-100 rounded-2xl h-64" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-2xl mx-auto">
        <div className="card p-8 text-center text-slate-500">
          <p className="mb-4">{error}</p>
          <Link href="/messages" className="btn-outline">Back to messages</Link>
        </div>
      </main>
    );
  }

  if (!conv) return null;

  const userId = session?.user?.id;
  const isBuyer = conv.buyerId === userId;
  const otherUser = isBuyer ? conv.seller : conv.buyer;

  return (
    <main className="max-w-2xl mx-auto flex flex-col gap-4">
      {/* Back link */}
      <Link href="/messages" className="text-sm text-blue-600 hover:underline">
        ← Back to messages
      </Link>

      {/* Product context */}
      <div className="card p-4 flex gap-4 items-center">
        <div className="relative w-14 h-14 flex-shrink-0 bg-slate-100 rounded-xl overflow-hidden">
          <Image
            src={conv.product.imageUrl}
            alt={conv.product.title}
            fill
            className="object-cover"
          />
        </div>
        <div className="flex-1 min-w-0">
          <Link
            href={`/products/${conv.product.id}`}
            className="font-semibold text-sm hover:text-blue-600 block truncate"
          >
            {conv.product.title}
          </Link>
          <p className="text-sm text-slate-500">{dollars(conv.product.priceCents)}</p>
          {conv.product.status === 'SOLD' && (
            <span className="badge-slate badge mt-0.5">Sold</span>
          )}
        </div>
        <p className="text-xs text-slate-400 flex-shrink-0">
          {isBuyer ? `Seller: ${conv.seller.name}` : `Buyer: ${conv.buyer.name}`}
        </p>
      </div>

      {/* Message thread */}
      <div className="card p-4 flex flex-col gap-3 max-h-[28rem] overflow-y-auto">
        {conv.messages.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No messages yet</p>
        ) : (
          conv.messages.map((msg) => {
            const isMe = msg.senderId === userId;
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                    isMe
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                  }`}
                >
                  {msg.body}
                </div>
                <p className="text-xs text-slate-400 px-1">
                  {isMe ? 'You' : msg.sender.name} · {formatTime(msg.createdAt)}
                </p>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply form */}
      <form onSubmit={handleSend} className="card p-4 flex gap-3 items-end">
        <textarea
          className="input flex-1 resize-none"
          rows={2}
          placeholder="Type a message…"
          value={reply}
          maxLength={2000}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend(e as unknown as React.FormEvent);
            }
          }}
          disabled={sending}
        />
        <button
          type="submit"
          className="btn-primary flex-shrink-0"
          disabled={sending || !reply.trim()}
        >
          {sending ? 'Sending…' : 'Send'}
        </button>
      </form>
      {sendError && <p className="text-red-600 text-xs px-1">{sendError}</p>}
    </main>
  );
}
