'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageCircle, Send, Radio, Eye } from 'lucide-react';
import { RTC_CONFIG, HAS_TURN_CONFIG } from '@/lib/rtc-config';

const DEFAULT_GUEST_NAME = 'Guest';
const MEDIA_READY_TIMEOUT_MS = 1200;
const PLAYBACK_RETRY_DELAY_MS = 250;
const CONNECTION_RECOVERY_TIMEOUT_MS = 8000;
const STREAM_RECONNECTING_MESSAGE = 'Live stream connection was interrupted. Trying to reconnect…';

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
  const [hasRemoteMedia, setHasRemoteMedia] = useState(false);
  const [playbackBlocked, setPlaybackBlocked] = useState(false);
  const [recoveringConnection, setRecoveringConnection] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);

  const lastSeenRef = useRef<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const activeOfferSignalRef = useRef<string | null>(null);
  const viewerHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const connectionRecoveryTimeoutRef = useRef<number | null>(null);
  const hasRemoteDescriptionRef = useRef(false);
  const pendingRemoteIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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
    if (connectionRecoveryTimeoutRef.current != null) {
      window.clearTimeout(connectionRecoveryTimeoutRef.current);
      connectionRecoveryTimeoutRef.current = null;
    }
    peerRef.current?.close();
    peerRef.current = null;
    remoteStreamRef.current = null;
    activeOfferSignalRef.current = null;
    hasRemoteDescriptionRef.current = false;
    pendingRemoteIceCandidatesRef.current = [];
    setStreamConnected(false);
    setHasRemoteMedia(false);
    setPlaybackBlocked(false);
    setRecoveringConnection(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const clearConnectionRecoveryTimeout = useCallback(() => {
    if (connectionRecoveryTimeoutRef.current != null) {
      window.clearTimeout(connectionRecoveryTimeoutRef.current);
      connectionRecoveryTimeoutRef.current = null;
    }
  }, []);

  const scheduleConnectionRecoveryTimeout = useCallback((pc: RTCPeerConnection) => {
    clearConnectionRecoveryTimeout();
    connectionRecoveryTimeoutRef.current = window.setTimeout(() => {
      connectionRecoveryTimeoutRef.current = null;
      if (peerRef.current !== pc) return;
      const currentPeer = peerRef.current;
      if (currentPeer?.connectionState === 'connected') return;
      setStreamConnected(false);
      setRecoveringConnection(false);
      setStreamError('Live stream is reconnecting. Waiting for the seller to refresh the connection…');
    }, CONNECTION_RECOVERY_TIMEOUT_MS);
  }, [clearConnectionRecoveryTimeout]);

  const playRemoteStream = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    // Apply mobile-friendly attributes before attempting play
    video.muted = false;
    video.defaultMuted = false;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('autoplay', 'true');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'auto';

    const tryPlay = async () => {
      await video.play();
      setPlaybackBlocked(false);
      return true;
    };

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve) => {
        let settled = false;

        const finish = () => {
          if (settled) return;
          settled = true;
          video.removeEventListener('loadedmetadata', finish);
          video.removeEventListener('loadeddata', finish);
          video.removeEventListener('canplay', finish);
          resolve();
        };

        const timeout = window.setTimeout(finish, MEDIA_READY_TIMEOUT_MS);

        const wrappedFinish = () => {
          window.clearTimeout(timeout);
          finish();
        };

        video.addEventListener('loadedmetadata', wrappedFinish, { once: true });
        video.addEventListener('loadeddata', wrappedFinish, { once: true });
        video.addEventListener('canplay', wrappedFinish, { once: true });
      });
    }

    try {
      return await tryPlay();
    } catch {
      try {
        await new Promise((resolve) => window.setTimeout(resolve, PLAYBACK_RETRY_DELAY_MS));
        return await tryPlay();
      } catch {
        setPlaybackBlocked(true);
        return false;
      }
    }
  }, []);

  const postSignal = useCallback(async (
    kind: 'ANSWER' | 'ICE',
    payload: Record<string, unknown>,
    options?: { critical?: boolean },
  ) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'BUYER', kind, payload }),
      });

      if (res.ok) return true;

      console.warn(`[GarageSaleBuyerLiveView] Failed to post ${kind} signal`, { status: res.status });
      if (options?.critical) {
        throw new Error(`Failed to post ${kind} signal`);
      }
      return false;
    } catch (error) {
      console.warn(`[GarageSaleBuyerLiveView] Network error posting ${kind} signal`);
      if (options?.critical) {
        throw error;
      }
      return false;
    }
  }, [saleId]);

  const getViewerId = useCallback(() => {
    if (viewerIdRef.current) return viewerIdRef.current;

    const storageKey = `garage-sale-live-viewer:${saleId}`;
    const stored = window.sessionStorage.getItem(storageKey);
    if (stored) {
      viewerIdRef.current = stored;
      return stored;
    }

    let nextId: string;
    if (window.crypto?.randomUUID) {
      nextId = window.crypto.randomUUID();
    } else if (window.crypto?.getRandomValues) {
      const bytes = new Uint32Array(2);
      window.crypto.getRandomValues(bytes);
      nextId = `viewer-${bytes[0].toString(36)}-${bytes[1].toString(36)}`;
    } else {
      const perfNow = window.performance?.now
        ? window.performance.now().toString(36).replace('.', '')
        : '0';
      nextId = `viewer-${Date.now().toString(36)}-${perfNow}`;
    }
    window.sessionStorage.setItem(storageKey, nextId);
    viewerIdRef.current = nextId;
    return nextId;
  }, [saleId]);

  const sendViewerHeartbeat = useCallback(async () => {
    if (!isLive) return;

    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'BUYER',
          kind: 'VIEWER_HEARTBEAT',
          payload: { viewerId: getViewerId() },
        }),
      });
      if (!res.ok) {
        console.warn('[GarageSaleBuyerLiveView] Viewer heartbeat failed', { status: res.status });
      }
    } catch {
      console.warn('[GarageSaleBuyerLiveView] Network error posting viewer heartbeat');
    }
  }, [getViewerId, isLive, saleId]);

  const handleSellerOffer = useCallback(async (signalId: string, payload: { type?: string; sdp?: string }) => {
    const type = payload.type === 'offer' ? payload.type : null;
    if (!type || !payload.sdp) return;
    if (typeof RTCPeerConnection === 'undefined') {
      setStreamError('Live streaming is not supported in this browser.');
      return;
    }

    closePeerConnection();

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;
    activeOfferSignalRef.current = signalId;
    hasRemoteDescriptionRef.current = false;
    pendingRemoteIceCandidatesRef.current = [];
    setHasRemoteMedia(false);

    pc.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        const alreadyAdded = remoteStream.getTracks().some((existing) => existing.id === track.id);
        if (!alreadyAdded) {
          remoteStream.addTrack(track);
        }
      }

      if (videoRef.current && videoRef.current.srcObject !== remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
      setHasRemoteMedia(true);
      setStreamError(null);
      void playRemoteStream();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postSignal('ICE', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearConnectionRecoveryTimeout();
        setRecoveringConnection(false);
        setStreamConnected(true);
        setStreamError(null);
        void playRemoteStream();
      }

      if (pc.connectionState === 'disconnected') {
        setRecoveringConnection(true);
        scheduleConnectionRecoveryTimeout(pc);
        // Show reconnect message but keep the video visible so ICE can self-recover
        setStreamError(STREAM_RECONNECTING_MESSAGE);
      }

      if (pc.connectionState === 'failed') {
        setRecoveringConnection(true);
        scheduleConnectionRecoveryTimeout(pc);
        setStreamError(STREAM_RECONNECTING_MESSAGE);
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        clearConnectionRecoveryTimeout();
        setRecoveringConnection(false);
        return;
      }

      if (pc.iceConnectionState === 'disconnected') {
        setRecoveringConnection(true);
        scheduleConnectionRecoveryTimeout(pc);
        return;
      }

      if (pc.iceConnectionState === 'failed') {
        setRecoveringConnection(true);
        scheduleConnectionRecoveryTimeout(pc);
      }
    };

    await pc.setRemoteDescription({ type, sdp: payload.sdp });
    hasRemoteDescriptionRef.current = true;
    for (const candidate of pendingRemoteIceCandidatesRef.current) {
      if (peerRef.current !== pc) break;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
        // Ignore stale or incompatible candidates
      }
    }
    pendingRemoteIceCandidatesRef.current = [];

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await postSignal('ANSWER', { type: answer.type, sdp: answer.sdp }, { critical: true });

    // Attach srcObject early so the video element is ready when tracks arrive
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
      void playRemoteStream();
    }
  }, [clearConnectionRecoveryTimeout, closePeerConnection, playRemoteStream, postSignal, scheduleConnectionRecoveryTimeout]);

  const pollSignals = useCallback(async () => {
    if (!isLive) return;

    try {
      const params = new URLSearchParams({ role: 'BUYER' });
      if (signalCursorRef.current) params.set('since', signalCursorRef.current);
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling?${params.toString()}`);
      if (!res.ok) {
        console.warn('[GarageSaleBuyerLiveView] Failed to poll buyer signals', { status: res.status });
        return;
      }

      const data = await res.json() as {
        isLive: boolean;
        viewerCount?: number;
        signals: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
      };

      if (!data.isLive) {
        setIsLive(false);
        setViewerCount(0);
        return;
      }

      setViewerCount(data.viewerCount ?? 0);

      for (const signal of data.signals) {
        if (signal.kind === 'OFFER') {
          // Skip already-processed offers without losing the cursor position.
          if (activeOfferSignalRef.current === signal.id) {
            signalCursorRef.current = signal.createdAt;
            continue;
          }
          const payload = signal.payload as { type?: string; sdp?: string } | null;
          if (!payload) {
            signalCursorRef.current = signal.createdAt;
            continue;
          }
          clearConnectionRecoveryTimeout();
          setRecoveringConnection(false);
          setStreamError(null);
          try {
            await handleSellerOffer(signal.id, payload);
            // Advance cursor only after the offer was successfully processed.
            // Unlike ICE, an OFFER must be retried on error, so the cursor is
            // intentionally NOT advanced in the catch branch.
            signalCursorRef.current = signal.createdAt;
          } catch {
            // Leave cursor unchanged so the offer is retried on the next poll.
            break;
          }
        } else if (signal.kind === 'ICE') {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (payload?.candidate) {
            if (!peerRef.current || !hasRemoteDescriptionRef.current) {
              pendingRemoteIceCandidatesRef.current.push(payload.candidate);
            } else {
              try {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch {
                // Ignore stale candidates from a previous peer connection
              }
            }
          }
          // ICE candidates are always consumed — failures are non-fatal and the
          // candidate should not be replayed on the next poll.
          signalCursorRef.current = signal.createdAt;
        } else {
          signalCursorRef.current = signal.createdAt;
        }
      }
    } catch {
      console.warn('[GarageSaleBuyerLiveView] Network error while polling buyer signals');
    }
  }, [clearConnectionRecoveryTimeout, handleSellerOffer, isLive, saleId]);

  useEffect(() => {
    if (!isLive) {
      stopSignalPolling();
      signalCursorRef.current = null;
      closePeerConnection();
      return;
    }

    pollSignals();
    signalPollRef.current = setInterval(pollSignals, 2000);

    return () => {
      stopSignalPolling();
    };
  }, [closePeerConnection, isLive, pollSignals, stopSignalPolling]);

  useEffect(() => {
    if (!isLive) {
      if (viewerHeartbeatRef.current) clearInterval(viewerHeartbeatRef.current);
      return;
    }

    if (viewerHeartbeatRef.current) clearInterval(viewerHeartbeatRef.current);
    void sendViewerHeartbeat();
    viewerHeartbeatRef.current = setInterval(() => {
      void sendViewerHeartbeat();
    }, 15000);

    return () => {
      if (viewerHeartbeatRef.current) clearInterval(viewerHeartbeatRef.current);
    };
  }, [isLive, sendViewerHeartbeat]);

  useEffect(() => {
    return () => {
      stopSignalPolling();
      closePeerConnection();
      if (viewerHeartbeatRef.current) clearInterval(viewerHeartbeatRef.current);
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
  const canRenderRemoteVideo = streamConnected || hasRemoteMedia;

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
          🔴 LIVE NOW
        </span>
        <p className="text-xs text-slate-500">The seller is live! Ask questions below.</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          <Eye size={12} /> {viewerCount} watching
        </span>
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-900 sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          preload="auto"
          controls
          className={`h-full w-full object-cover ${canRenderRemoteVideo ? '' : 'hidden'}`}
        />
        {!canRenderRemoteVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Radio size={40} className="animate-pulse text-red-400" />
            <p className="text-sm font-semibold">Connecting to seller stream…</p>
            <p className="text-xs text-slate-300 px-4 text-center">
              Live video may take a few seconds on mobile networks.
            </p>
          </div>
        )}
        {canRenderRemoteVideo && playbackBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 p-4">
            <button
              type="button"
              onClick={() => void playRemoteStream()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Tap to start live
            </button>
          </div>
        )}
        {canRenderRemoteVideo && recoveringConnection && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center p-4">
            <span className="rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow">
              Reconnecting to live stream…
            </span>
          </div>
        )}
      </div>

      {streamError && (
        <p className="rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-700">{streamError}</p>
      )}
      {!HAS_TURN_CONFIG && (
        <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          TURN relay is not configured. Some mobile viewers may fail to connect.
        </p>
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

        <div className="flex flex-col gap-2 sm:flex-row">
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
