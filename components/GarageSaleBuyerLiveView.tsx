'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageCircle, Send, Radio } from 'lucide-react';

const DEFAULT_GUEST_NAME = 'Guest';
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

interface ChatMessage {
  id: string;
  userId: string | null;
  guestName: string | null;
  message: string;
  createdAt: string;
}

interface Props {
  saleId: string;
  initialIsLive: boolean;
  buyerName?: string | null;
}

export default function GarageSaleBuyerLiveView({ saleId, initialIsLive, buyerName }: Props) {
  const [isLive, setIsLive] = useState(initialIsLive);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [guestName, setGuestName] = useState(buyerName ?? '');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const lastSeenRef = useRef<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const activeOfferSignalRef = useRef<string | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (lastSeenRef.current) params.set('since', lastSeenRef.current);
      const url = `/api/garage-sales/${saleId}/chat${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json() as { messages: ChatMessage[]; isLive: boolean };
      setIsLive(data.isLive);
      if (data.messages.length > 0) {
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
          return [...prev, ...newMsgs];
        });
        lastSeenRef.current = data.messages[data.messages.length - 1].createdAt;
      }
    } catch {
      // Silent fail — polling will retry
    }
  }, [saleId]);

  useEffect(() => {
    fetchMessages();
    pollRef.current = setInterval(fetchMessages, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchMessages]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const stopSignalPolling = useCallback(() => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
  }, []);

  const closePeerConnection = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current = null;
    activeOfferSignalRef.current = null;
    setStreamConnected(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const postSignal = useCallback(async (kind: 'ANSWER' | 'ICE', payload: Record<string, unknown>) => {
    await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'BUYER', kind, payload }),
    });
  }, [saleId]);

  const handleSellerOffer = useCallback(async (signalId: string, payload: { type?: string; sdp?: string }) => {
    const type = payload.type === 'offer' ? payload.type : null;
    if (!type || !payload.sdp) return;

    closePeerConnection();

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;
    activeOfferSignalRef.current = signalId;

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        remoteStream.addTrack(track);
      }
      setStreamConnected(remoteStream.getTracks().length > 0);
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postSignal('ICE', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setStreamError('Live stream connection was interrupted.');
      }
    };

    await pc.setRemoteDescription({ type, sdp: payload.sdp });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await postSignal('ANSWER', { type: answer.type, sdp: answer.sdp });

    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [closePeerConnection, postSignal]);

  const pollSignals = useCallback(async () => {
    if (!isLive) return;

    try {
      const params = new URLSearchParams({ role: 'BUYER' });
      if (signalCursorRef.current) params.set('since', signalCursorRef.current);
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling?${params.toString()}`);
      if (!res.ok) return;

      const data = await res.json() as {
        isLive: boolean;
        signals: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
      };

      if (!data.isLive) {
        setIsLive(false);
        return;
      }

      for (const signal of data.signals) {
        signalCursorRef.current = signal.createdAt;

        if (signal.kind === 'OFFER') {
          if (activeOfferSignalRef.current === signal.id) continue;
          const payload = signal.payload as { type?: string; sdp?: string } | null;
          if (!payload) continue;
          setStreamError(null);
          await handleSellerOffer(signal.id, payload);
        }

        if (signal.kind === 'ICE' && peerRef.current) {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (!payload?.candidate) continue;
          await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      }
    } catch {
      // polling retries
    }
  }, [handleSellerOffer, isLive, saleId]);

  useEffect(() => {
    if (!isLive) {
      stopSignalPolling();
      signalCursorRef.current = null;
      closePeerConnection();
      return;
    }

    pollSignals();
    signalPollRef.current = setInterval(pollSignals, 1200);

    return () => {
      stopSignalPolling();
    };
  }, [closePeerConnection, isLive, pollSignals, stopSignalPolling]);

  useEffect(() => {
    return () => {
      stopSignalPolling();
      closePeerConnection();
    };
  }, [closePeerConnection, stopSignalPolling]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed, guestName: guestName || DEFAULT_GUEST_NAME }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to send');
      }
      const msg = await res.json() as ChatMessage;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        if (existingIds.has(msg.id)) return prev;
        return [...prev, msg];
      });
      lastSeenRef.current = msg.createdAt;
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isLive) {
    return (
      <div className="card p-4 flex items-center gap-3 text-slate-500">
        <Radio size={16} className="shrink-0 text-slate-400" />
        <p className="text-sm">No live preview active at this time. Check back when the seller goes live.</p>
      </div>
    );
  }

  return (
    <div className="card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
          🔴 LIVE NOW
        </span>
        <p className="text-xs text-slate-500">The seller is live! Ask questions below.</p>
      </div>

      <div className="rounded-xl bg-slate-900 aspect-video relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          controls
          className={`h-full w-full object-cover ${streamConnected ? '' : 'hidden'}`}
        />
        {!streamConnected && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Radio size={40} className="animate-pulse text-red-400" />
            <p className="text-sm font-semibold">Connecting to seller stream…</p>
            <p className="text-xs text-slate-300 px-4 text-center">
              If playback does not start, keep this page open for a moment.
            </p>
          </div>
        )}
      </div>

      {streamError && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{streamError}</p>
      )}

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
          <MessageCircle size={13} /> Live Chat
        </h3>

        <div className="h-48 overflow-y-auto space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
          {messages.length === 0 ? (
            <p className="text-xs text-slate-400 text-center mt-8">No messages yet. Be the first to say hi! 👋</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="flex gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                  {(m.guestName ?? 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-700">{m.guestName ?? 'Buyer'} </span>
                  <span className="text-slate-600">{m.message}</span>
                </div>
              </div>
            ))
          )}
          <div ref={chatBottomRef} />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{error}</p>
        )}

        {!buyerName && (
          <input
            type="text"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Your name (optional)"
            maxLength={50}
            className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--ff-primary-navy)]"
          />
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question…"
            maxLength={500}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ff-primary-navy)]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="btn-brand flex items-center gap-1.5 px-4 disabled:opacity-50"
          >
            <Send size={13} /> {sending ? '…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
