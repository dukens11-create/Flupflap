'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { MessageCircle } from 'lucide-react';

const QUICK_MESSAGE = "Is this still available?";

export default function ContactSellerButton({ productId }: { productId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(QUICK_MESSAGE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    if (!session?.user) {
      router.push('/login');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, body: body.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to send message.');
        setLoading(false);
        return;
      }
      router.push(`/messages/${data.conversationId}`);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  if (status === 'loading') return null;

  return (
    <div>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            if (!session?.user) {
              router.push('/login');
            } else {
              setOpen(true);
            }
          }}
          className="btn-outline w-full flex items-center justify-center gap-2"
        >
          <MessageCircle size={16} />
          Message Seller
        </button>
      ) : (
        <form onSubmit={handleSend} className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
          <p className="text-sm font-medium text-slate-700">Ask the seller a question</p>
          <textarea
            className="input resize-none"
            rows={3}
            maxLength={2000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Type your message…"
            autoFocus
          />
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading || !body.trim()}
            >
              {loading ? 'Sending…' : 'Send Message'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => { setOpen(false); setError(''); setBody(QUICK_MESSAGE); }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
