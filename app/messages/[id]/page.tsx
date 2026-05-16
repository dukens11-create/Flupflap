'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { dollars } from '@/lib/money';
import { ImagePlus, X } from 'lucide-react';
import {
  isSafeMessageAttachmentUrl,
  MESSAGE_ATTACHMENT_HELP_TEXT,
} from '@/lib/message-attachments';
import UserAvatar from '@/components/UserAvatar';

type Sender = { id: string; name: string; profileImageUrl?: string | null };

type Message = {
  id: string;
  body: string;
  attachmentUrl: string | null;
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

export default function ConversationPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [conv, setConv] = useState<ConversationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendError, setSendError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetch(`/api/messages/${id}`);
      if (res.status === 401 || res.status === 403) {
        setError('Your session has expired. Please sign in again to view this conversation.');
        setConv(null);
        setLoading(false);
        return;
      }
      if (!res.ok) { setError('Conversation not found.'); setLoading(false); return; }
      const data: ConversationData = await res.json();
      setConv(data);
    } catch {
      setError('Failed to load conversation.');
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (status === 'unauthenticated') { setLoading(false); return; }
    if (status === 'authenticated') load();
  }, [status, load]);

  // Scroll to bottom when messages change
  const lastMessageId = conv?.messages[conv.messages.length - 1]?.id;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lastMessageId]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    await submitMessage();
  }

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSendError('');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/messages/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          setSendError('Your session has expired. Please sign in again to upload attachments.');
          return;
        }
        setSendError(data.error || 'Photo upload failed.');
        return;
      }
      setAttachmentUrl(data.url);
    } catch {
      setSendError('Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function submitMessage() {
    if (!reply.trim() && !attachmentUrl) return;
    setSendError('');
    setSending(true);
    try {
      const res = await fetch(`/api/messages/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: reply.trim(),
          attachmentUrl: attachmentUrl || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        if (res.status === 401 || res.status === 403) {
          setSendError('Your session has expired. Please sign in again to send messages.');
          setSending(false);
          return;
        }
        setSendError(d.error || 'Failed to send message.');
        setSending(false);
        return;
      }
      setReply('');
      setAttachmentUrl('');
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

  if (!session?.user) {
    return (
      <main className="max-w-2xl mx-auto">
        <div className="card p-6 text-center text-slate-600">
          <p className="font-medium mb-2">You&apos;re signed out.</p>
          <p className="text-sm mb-4">Please sign in to open this conversation.</p>
          <Link href={`/login?callbackUrl=/messages/${id}`} className="btn-primary">Sign in</Link>
        </div>
      </main>
    );
  }

  if (!conv) return null;

  const userId = session?.user?.id;
  const isBuyer = conv.buyerId === userId;

  return (
    <main className="max-w-2xl mx-auto flex flex-col gap-4">
      {/* Back link */}
      <Link href="/messages" className="text-sm text-blue-600 hover:underline">
        ← Back to messages
      </Link>

      {/* Product context */}
      <div className="card p-4 flex gap-4 items-center">
        <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
          <Image
            src={conv.product.imageUrl}
            alt={conv.product.title}
            fill
            className="object-contain p-1"
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
        {isBuyer ? (
          <p className="text-xs text-slate-400 flex-shrink-0">Seller: {conv.seller.name}</p>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
            <UserAvatar imageUrl={conv.buyer.profileImageUrl} name={conv.buyer.name} className="h-5 w-5" />
            <span className="truncate">Buyer: {conv.buyer.name}</span>
          </div>
        )}
      </div>

      {/* Message thread */}
      <div className="card p-4 flex flex-col gap-3 max-h-[28rem] overflow-y-auto">
        {conv.messages.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-8">No messages yet</p>
        ) : (
          conv.messages.map((msg) => {
            const isMe = msg.senderId === userId;
            const safeAttachmentUrl = isSafeMessageAttachmentUrl(msg.attachmentUrl)
              ? msg.attachmentUrl
              : null;
            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isMe ? 'items-end' : 'items-start'}`}
              >
                <div className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                  {!isMe && msg.senderId === conv.buyerId && (
                    <UserAvatar imageUrl={msg.sender.profileImageUrl} name={msg.sender.name} className="h-6 w-6" />
                  )}
                  <div
                    className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm break-words ${
                      isMe
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-slate-100 text-slate-900 rounded-bl-sm'
                    }`}
                  >
                    {safeAttachmentUrl && (
                      <a href={safeAttachmentUrl} target="_blank" rel="noreferrer" className="block mb-2">
                        <img
                          src={safeAttachmentUrl}
                          alt="Shared attachment"
                          className="max-h-56 w-auto rounded-xl border border-black/10 object-cover"
                        />
                      </a>
                    )}
                    {msg.body && <p>{msg.body}</p>}
                    {!msg.body && safeAttachmentUrl && (
                      <p className={`text-xs ${isMe ? 'text-blue-100' : 'text-slate-500'}`}>Photo attachment</p>
                    )}
                  </div>
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
      <form onSubmit={handleSend} className="card p-4 flex flex-col gap-3">
        <div className="flex gap-3 items-end">
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
                submitMessage();
              }
            }}
            disabled={sending || uploading}
          />
          <button
            type="submit"
            className="btn-primary flex-shrink-0"
            disabled={sending || uploading || (!reply.trim() && !attachmentUrl)}
          >
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
            <ImagePlus size={16} />
            {uploading ? 'Uploading photo…' : 'Attach photo'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={handleAttachmentChange}
              disabled={sending || uploading}
            />
          </label>
          <span className="text-xs text-slate-500">{MESSAGE_ATTACHMENT_HELP_TEXT}</span>
        </div>
        {isSafeMessageAttachmentUrl(attachmentUrl) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 flex items-start justify-between gap-3">
            <img
              src={attachmentUrl}
              alt="New attachment preview"
              className="h-24 w-24 rounded-lg object-cover border border-slate-200"
            />
            <button
              type="button"
              className="text-slate-500 hover:text-slate-700"
              onClick={() => setAttachmentUrl('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
      </form>
      {sendError && <p className="text-red-600 text-xs px-1">{sendError}</p>}
    </main>
  );
}
