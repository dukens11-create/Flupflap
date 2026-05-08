'use client';

import { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { ImagePlus, MessageCircle, X } from 'lucide-react';

const QUICK_MESSAGE = "Is this still available?";

export default function ContactSellerButton({ productId }: { productId: string }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(QUICK_MESSAGE);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleAttachmentChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    const fd = new FormData();
    fd.append('file', file);

    try {
      const res = await fetch('/api/messages/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Photo upload failed.');
        return;
      }
      setAttachmentUrl(data.url);
    } catch {
      setError('Photo upload failed. Please try again.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() && !attachmentUrl) return;

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
        body: JSON.stringify({
          productId,
          body: body.trim(),
          attachmentUrl: attachmentUrl || null,
        }),
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="btn-outline text-sm cursor-pointer inline-flex items-center gap-2">
              <ImagePlus size={16} />
              {uploading ? 'Uploading photo…' : 'Attach photo'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAttachmentChange}
                disabled={loading || uploading}
              />
            </label>
            <span className="text-xs text-slate-500">Photos only · up to 5 MB</span>
          </div>
          {attachmentUrl && (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <img
                  src={attachmentUrl}
                  alt="Message attachment preview"
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
            </div>
          )}
          {error && <p className="text-red-600 text-xs">{error}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              className="btn-primary flex-1"
              disabled={loading || uploading || (!body.trim() && !attachmentUrl)}
            >
              {loading ? 'Sending…' : 'Send Message'}
            </button>
            <button
              type="button"
              className="btn-outline"
              onClick={() => {
                setOpen(false);
                setError('');
                setBody(QUICK_MESSAGE);
                setAttachmentUrl('');
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
