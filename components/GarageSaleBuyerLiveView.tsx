'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { MessageCircle, Send, Radio, Eye, Heart } from 'lucide-react';
import { RTC_CONFIG, HAS_TURN_CONFIG } from '@/lib/rtc-config';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_STEP_DELAY_MS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_JITTER_MS,
  WAITING_FOR_PUBLISHER_TIMEOUT_MS,
  STREAM_RECONNECTING_MESSAGE,
  STREAM_TERMINAL_FAILURE_MESSAGE,
  getConnectionStatusLabel,
  type ViewerConnectionStatus,
} from '@/lib/live-stream-viewer-state';

const DEFAULT_GUEST_NAME = 'Guest';
const MEDIA_READY_TIMEOUT_MS = 1200;
const PLAYBACK_RETRY_DELAY_MS = 250;
const PLAYBACK_RECOVERY_THROTTLE_MS = 1200;
const CONNECTION_RECOVERY_TIMEOUT_MS = 8000;
const RECENT_CANDIDATE_TYPES_LIMIT = 6;
type IceCandidateType = 'host' | 'srflx' | 'relay' | 'prflx' | 'unknown';

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

function getIceCandidateType(candidate?: string): IceCandidateType {
  if (!candidate) return 'unknown';
  const rawType = candidate.match(/\btyp\s+([a-z0-9]+)/i)?.[1]?.toLowerCase();
  switch (rawType) {
    case 'host':
    case 'srflx':
    case 'relay':
    case 'prflx':
      return rawType;
    default:
      return 'unknown';
  }
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
  const [audioUnlockRequired, setAudioUnlockRequired] = useState(false);
  const [recoveringConnection, setRecoveringConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ViewerConnectionStatus>(initialIsLive ? 'connecting' : 'ended');
  const [viewerCount, setViewerCount] = useState(0);
  const [debugPcState, setDebugPcState] = useState<string>('none');
  const [debugIceState, setDebugIceState] = useState<string>('none');
  const [debugIceGatheringState, setDebugIceGatheringState] = useState<string>('none');
  const [debugSignalingState, setDebugSignalingState] = useState<string>('none');
  const [debugReconnectAttempts, setDebugReconnectAttempts] = useState(0);
  const [debugRecentCandidateTypes, setDebugRecentCandidateTypes] = useState<IceCandidateType[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [likeAnimating, setLikeAnimating] = useState(false);
  const [likeSending, setLikeSending] = useState(false);

  const lastSeenRef = useRef<string | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Stable anonymous guest ID for like/reaction tracking across multiple taps.
  // Uses crypto.randomUUID when available; falls back to combining timestamp and
  // two random segments to reduce collision probability.
  const guestIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`,
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Reconnect timers outlive a single render; use a ref to avoid stale poll closures.
  const pollSignalsRef = useRef<(() => Promise<void>) | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const activeOfferSignalRef = useRef<string | null>(null);
  const viewerHeartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const connectionRecoveryTimeoutRef = useRef<number | null>(null);
  const reconnectRetryTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const playbackRecoveryAtRef = useRef(0);
  const hasRemoteDescriptionRef = useRef(false);
  const pendingRemoteIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const waitingForPublisherTimerRef = useRef<number | null>(null);
  const liveDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_LIVE_STREAM === '1';
  const liveDebugOverlayEnabled = process.env.NEXT_PUBLIC_LIVE_DEBUG_OVERLAY === 'true';

  const logLiveDebug = useCallback((event: string, details?: Record<string, unknown>) => {
    if (!liveDebugEnabled) return;
    if (details) {
      console.info('[GarageSaleBuyerLiveView]', event, details);
      return;
    }
    console.info('[GarageSaleBuyerLiveView]', event);
  }, [liveDebugEnabled]);

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
    setAudioUnlockRequired(false);
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

  const clearReconnectRetryTimeout = useCallback(() => {
    if (reconnectRetryTimeoutRef.current != null) {
      window.clearTimeout(reconnectRetryTimeoutRef.current);
      reconnectRetryTimeoutRef.current = null;
    }
  }, []);

  const clearWaitingForPublisherTimer = useCallback(() => {
    if (waitingForPublisherTimerRef.current != null) {
      window.clearTimeout(waitingForPublisherTimerRef.current);
      waitingForPublisherTimerRef.current = null;
    }
  }, []);

  const resetReconnectState = useCallback(() => {
    reconnectAttemptRef.current = 0;
    setDebugReconnectAttempts(0);
    clearConnectionRecoveryTimeout();
    clearReconnectRetryTimeout();
  }, [clearConnectionRecoveryTimeout, clearReconnectRetryTimeout]);

  const rememberCandidateType = useCallback((candidate?: string) => {
    const candidateType = getIceCandidateType(candidate);
    setDebugRecentCandidateTypes((previous) => [candidateType, ...previous].slice(0, RECENT_CANDIDATE_TYPES_LIMIT));
    return candidateType;
  }, []);

  const playRemoteStream = useCallback(async (options?: { tryMutedFirst?: boolean }) => {
    const video = videoRef.current;
    if (!video) return false;

    // Apply mobile-friendly attributes before attempting play
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('autoplay', 'true');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');
    video.preload = 'auto';

    const tryPlay = async (muted: boolean) => {
      video.muted = muted;
      video.defaultMuted = muted;
      await video.play();
      setPlaybackBlocked(false);
      setAudioUnlockRequired(muted);
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

    const initialMuted = options?.tryMutedFirst ?? true;
    const attempts = initialMuted ? [true, false] : [false, true];

    for (const muted of attempts) {
      try {
        logLiveDebug('play-attempt', {
          muted,
          readyState: video.readyState,
          paused: video.paused,
        });
        return await tryPlay(muted);
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, PLAYBACK_RETRY_DELAY_MS));
      }
    }

    setPlaybackBlocked(true);
    logLiveDebug('play-failed', {
      readyState: video.readyState,
      paused: video.paused,
      networkState: video.networkState,
    });
    return false;
  }, [logLiveDebug]);

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

  const scheduleConnectionRecovery = useCallback((reason: string) => {
    if (!isLive) return false;
    if (reconnectRetryTimeoutRef.current != null) return true;

    const attempt = reconnectAttemptRef.current + 1;
    reconnectAttemptRef.current = attempt;
    setDebugReconnectAttempts(attempt);

    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      setRecoveringConnection(false);
      setConnectionStatus('failed');
      setStreamConnected(false);
      setStreamError(STREAM_TERMINAL_FAILURE_MESSAGE);
      logLiveDebug('reconnect-terminal-failure', { reason, attempts: attempt - 1 });
      return false;
    }

    const retryDelay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_STEP_DELAY_MS * (2 ** (attempt - 1)),
    ) + Math.floor(Math.random() * RECONNECT_JITTER_MS);

    setRecoveringConnection(true);
    setConnectionStatus('reconnecting');
    setStreamConnected(false);
    setStreamError(STREAM_RECONNECTING_MESSAGE);
    logLiveDebug('reconnect-scheduled', { reason, attempt, retryDelay });

    clearConnectionRecoveryTimeout();
    connectionRecoveryTimeoutRef.current = window.setTimeout(() => {
      connectionRecoveryTimeoutRef.current = null;
      if (peerRef.current?.connectionState === 'connected') return;
      setStreamError(STREAM_RECONNECTING_MESSAGE);
    }, CONNECTION_RECOVERY_TIMEOUT_MS);

    reconnectRetryTimeoutRef.current = window.setTimeout(() => {
      reconnectRetryTimeoutRef.current = null;
      if (!isLive) return;
      logLiveDebug('reconnect-executing', { attempt });
      closePeerConnection();
      setRecoveringConnection(true);
      activeOfferSignalRef.current = null;
      hasRemoteDescriptionRef.current = false;
      pendingRemoteIceCandidatesRef.current = [];
      signalCursorRef.current = null;
      void pollSignalsRef.current?.();
    }, retryDelay);
    return true;
  }, [clearConnectionRecoveryTimeout, closePeerConnection, isLive, logLiveDebug]);

  const handleSellerOffer = useCallback(async (signalId: string, payload: { type?: string; sdp?: string }) => {
    const type = payload.type === 'offer' ? payload.type : null;
    if (!type || !payload.sdp) return;
    if (typeof RTCPeerConnection === 'undefined') {
      setStreamError('Live streaming is not supported in this browser.');
      return;
    }

    closePeerConnection();
    // Cancel the waiting-for-publisher timer — we received an offer
    clearWaitingForPublisherTimer();

    const remoteStream = new MediaStream();
    remoteStreamRef.current = remoteStream;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    peerRef.current = pc;
    activeOfferSignalRef.current = signalId;
    hasRemoteDescriptionRef.current = false;
    pendingRemoteIceCandidatesRef.current = [];
    setHasRemoteMedia(false);
    setConnectionStatus('connecting');
    setRecoveringConnection(false);
    resetReconnectState();
    setDebugRecentCandidateTypes([]);
    setDebugPcState(pc.connectionState);
    setDebugIceState(pc.iceConnectionState);
    setDebugIceGatheringState(pc.iceGatheringState);
    setDebugSignalingState(pc.signalingState);
    logLiveDebug('offer-received', { signalId });
    const logPeerStates = (event: string, details?: Record<string, unknown>) => {
      logLiveDebug(event, {
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        iceGatheringState: pc.iceGatheringState,
        signalingState: pc.signalingState,
        ...details,
      });
    };
    logPeerStates('peer-created', { signalId });

    pc.ontrack = (event) => {
      const streamTracks = event.streams[0]?.getTracks() ?? [];
      const tracks = streamTracks.length > 0 ? streamTracks : [event.track];

      for (const track of tracks) {
        const alreadyAdded = remoteStream.getTracks().some((existing) => existing.id === track.id);
        if (!alreadyAdded) {
          remoteStream.addTrack(track);
        }
      }

      if (videoRef.current && videoRef.current.srcObject !== remoteStream) {
        videoRef.current.srcObject = remoteStream;
      }
      logLiveDebug('track-received', {
        trackId: event.track.id,
        kind: event.track.kind,
        enabled: event.track.enabled,
        muted: event.track.muted,
        readyState: event.track.readyState,
        streamTrackCount: remoteStream.getTracks().length,
        audioTracks: remoteStream.getAudioTracks().length,
        videoTracks: remoteStream.getVideoTracks().length,
      });
      setHasRemoteMedia(true);
      setStreamError(null);
      void playRemoteStream();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidateType = rememberCandidateType(event.candidate.candidate);
      logPeerStates('local-ice-candidate', { candidateType });
      void postSignal('ICE', { candidate: event.candidate.toJSON() });
    };

    pc.onconnectionstatechange = () => {
      logPeerStates('peer-connection-state-change');
      setDebugPcState(pc.connectionState);
      if (pc.connectionState === 'connected') {
        resetReconnectState();
        setRecoveringConnection(false);
        setStreamConnected(true);
        setConnectionStatus('live');
        setStreamError(null);
        void playRemoteStream();
      }

      if (pc.connectionState === 'disconnected') {
        scheduleConnectionRecovery('peer-disconnected');
      }

      if (pc.connectionState === 'failed') {
        scheduleConnectionRecovery('peer-failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      logPeerStates('ice-connection-state-change');
      setDebugIceState(pc.iceConnectionState);
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        resetReconnectState();
        setRecoveringConnection(false);
        return;
      }

      if (pc.iceConnectionState === 'disconnected') {
        scheduleConnectionRecovery('ice-disconnected');
        return;
      }

      if (pc.iceConnectionState === 'failed') {
        scheduleConnectionRecovery('ice-failed');
      }
    };

    pc.onicegatheringstatechange = () => {
      logPeerStates('ice-gathering-state-change');
      setDebugIceGatheringState(pc.iceGatheringState);
    };

    pc.onsignalingstatechange = () => {
      logPeerStates('signaling-state-change');
      setDebugSignalingState(pc.signalingState);
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
  }, [clearWaitingForPublisherTimer, closePeerConnection, logLiveDebug, playRemoteStream, postSignal, resetReconnectState, scheduleConnectionRecovery]);

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
        setConnectionStatus('ended');
        return;
      }

      setViewerCount(data.viewerCount ?? 0);

      for (const signal of data.signals) {
        if (signal.kind === 'OFFER') {
          logLiveDebug('signal-offer', { id: signal.id, createdAt: signal.createdAt });
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
            signalCursorRef.current = signal.createdAt;
          } catch {
            const willRetry = scheduleConnectionRecovery('offer-processing-failed');
            if (!willRetry) {
              // After terminal failure, consume the current offer and wait for a newer one.
              signalCursorRef.current = signal.createdAt;
            }
            // During active recovery we keep the cursor unchanged to retry this offer.
            break;
          }
        } else if (signal.kind === 'ICE') {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (payload?.candidate) {
            const candidateType = rememberCandidateType(payload.candidate.candidate);
            logLiveDebug('signal-ice', { createdAt: signal.createdAt, candidateType });
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
  }, [clearConnectionRecoveryTimeout, handleSellerOffer, isLive, logLiveDebug, saleId, scheduleConnectionRecovery]);

  useEffect(() => {
    pollSignalsRef.current = pollSignals;
  }, [pollSignals]);

  useEffect(() => {
    if (!isLive) {
      stopSignalPolling();
      signalCursorRef.current = null;
      clearReconnectRetryTimeout();
      clearConnectionRecoveryTimeout();
      clearWaitingForPublisherTimer();
      closePeerConnection();
      setConnectionStatus('ended');
      setStreamError(null);
      return;
    }

    setConnectionStatus('connecting');
    pollSignals();
    signalPollRef.current = setInterval(pollSignals, 2000);

    // If no seller OFFER is received within the timeout, transition to
    // 'waitingForPublisher' so viewers see a clear "no stream yet" message
    // rather than an indefinite "Connecting…" spinner.
    waitingForPublisherTimerRef.current = window.setTimeout(() => {
      waitingForPublisherTimerRef.current = null;
      if (activeOfferSignalRef.current !== null) return;
      setConnectionStatus((prev) => (prev === 'connecting' ? 'waitingForPublisher' : prev));
      logLiveDebug('waiting-for-publisher-timeout');
    }, WAITING_FOR_PUBLISHER_TIMEOUT_MS);

    return () => {
      stopSignalPolling();
      clearWaitingForPublisherTimer();
    };
  }, [clearConnectionRecoveryTimeout, clearReconnectRetryTimeout, clearWaitingForPublisherTimer, closePeerConnection, isLive, logLiveDebug, pollSignals, stopSignalPolling]);

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
      clearReconnectRetryTimeout();
      clearConnectionRecoveryTimeout();
      clearWaitingForPublisherTimer();
      closePeerConnection();
      if (viewerHeartbeatRef.current) clearInterval(viewerHeartbeatRef.current);
    };
  }, [clearConnectionRecoveryTimeout, clearReconnectRetryTimeout, clearWaitingForPublisherTimer, closePeerConnection, stopSignalPolling]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      logLiveDebug('remote-video-metadata', {
        width: video.videoWidth,
        height: video.videoHeight,
      });
      void playRemoteStream();
    };

    const handlePause = () => {
      if (!isLive || !hasRemoteMedia) return;
      const now = Date.now();
      if (now - playbackRecoveryAtRef.current < PLAYBACK_RECOVERY_THROTTLE_MS) return;
      playbackRecoveryAtRef.current = now;
      logLiveDebug('remote-video-paused-retrying');
      void playRemoteStream();
    };

    const handleBuffering = (event: Event) => {
      if (!isLive) return;
      const now = Date.now();
      if (now - playbackRecoveryAtRef.current < PLAYBACK_RECOVERY_THROTTLE_MS) return;
      playbackRecoveryAtRef.current = now;
      logLiveDebug('remote-video-buffering', { type: event.type });
      void playRemoteStream({ tryMutedFirst: false });
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('pause', handlePause);
    video.addEventListener('stalled', handleBuffering);
    video.addEventListener('waiting', handleBuffering);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('stalled', handleBuffering);
      video.removeEventListener('waiting', handleBuffering);
    };
  }, [hasRemoteMedia, isLive, logLiveDebug, playRemoteStream]);

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

  const handleLike = async () => {
    if (likeSending) return;
    setLikeSending(true);
    // Optimistic update + animation
    setLikeCount((c) => c + 1);
    setLikeAnimating(true);
    setTimeout(() => setLikeAnimating(false), 700);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'heart', guestId: guestIdRef.current }),
      });
      if (res.ok) {
        const data = await res.json() as { totalLikes: number };
        setLikeCount(data.totalLikes);
      }
    } catch {
      // Optimistic — no rollback needed for likes
    } finally {
      setLikeSending(false);
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
  const showRemoteVideo = streamConnected || hasRemoteMedia;
  const connectionStatusLabel = getConnectionStatusLabel(connectionStatus);
  const connectionStatusTone = (() => {
    switch (connectionStatus) {
      case 'live':
        return 'bg-emerald-100 text-emerald-700';
      case 'waitingForPublisher':
        return 'bg-slate-100 text-slate-600';
      case 'reconnecting':
        return 'bg-amber-100 text-amber-800';
      case 'failed':
        return 'bg-red-100 text-red-700';
      case 'ended':
        return 'bg-slate-200 text-slate-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  })();

  return (
    <div className="card space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        {connectionStatus === 'live' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1 text-xs font-bold text-white animate-pulse">
            🔴 LIVE NOW
          </span>
        )}
        <p className="text-xs text-slate-500">The seller is live! Ask questions below.</p>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          <Eye size={12} /> {viewerCount} watching
        </span>
        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${connectionStatusTone}`}>
          {connectionStatusLabel}
        </span>
      </div>

      <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-slate-900 sm:aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          preload="auto"
          controls
          className={`h-full w-full object-contain ${showRemoteVideo ? '' : 'hidden'}`}
        />
        {!showRemoteVideo && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <Radio size={40} className="animate-pulse text-red-400" />
            {connectionStatus === 'waitingForPublisher' ? (
              <>
                <p className="text-sm font-semibold">Waiting for seller stream…</p>
                <p className="text-xs text-slate-300 px-4 text-center">
                  The seller has started a session but hasn't sent a video stream yet. Please wait.
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold">Connecting to seller stream…</p>
                <p className="text-xs text-slate-300 px-4 text-center">
                  Live video may take a few seconds on mobile networks.
                </p>
              </>
            )}
          </div>
        )}
        {showRemoteVideo && playbackBlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 p-4">
            <button
              type="button"
              onClick={() => void playRemoteStream({ tryMutedFirst: false })}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Tap to start live
            </button>
          </div>
        )}
        {showRemoteVideo && !playbackBlocked && audioUnlockRequired && (
          <div className="absolute inset-0 flex items-end justify-center p-4 sm:items-center">
            <button
              type="button"
              onClick={() => void playRemoteStream({ tryMutedFirst: false })}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Tap for live audio
            </button>
          </div>
        )}
        {showRemoteVideo && recoveringConnection && (
          <div className="pointer-events-none absolute inset-0 flex items-start justify-center p-4">
            <span className="rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow">
              Reconnecting to live stream…
            </span>
          </div>
        )}
        {liveDebugOverlayEnabled && (
          <div className="pointer-events-none absolute bottom-2 left-2 max-w-[92%] rounded-lg bg-black/70 px-2.5 py-2 text-[10px] leading-tight text-white backdrop-blur-sm sm:max-w-sm">
            <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 font-mono">
              <span className="text-white/75">conn</span>
              <span className="truncate">{debugPcState}</span>
              <span className="text-white/75">ice</span>
              <span className="truncate">{debugIceState}</span>
              <span className="text-white/75">gather</span>
              <span className="truncate">{debugIceGatheringState}</span>
              <span className="text-white/75">signal</span>
              <span className="truncate">{debugSignalingState}</span>
              <span className="text-white/75">retries</span>
              <span>{debugReconnectAttempts}</span>
              <span className="text-white/75">candidates</span>
              <span className="truncate">{debugRecentCandidateTypes.length > 0 ? debugRecentCandidateTypes.join(', ') : 'none'}</span>
            </div>
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

      {/* Like / heart button */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleLike()}
          disabled={likeSending}
          aria-label="Like this live"
          className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all duration-150 select-none
            ${likeAnimating
              ? 'scale-125 bg-red-100 text-red-600'
              : 'bg-slate-100 text-slate-600 hover:bg-red-50 hover:text-red-500'
            } disabled:opacity-60`}
        >
          <Heart
            size={16}
            className={`transition-all duration-150 ${likeAnimating ? 'fill-red-500 text-red-500 scale-110' : ''}`}
          />
          {likeCount > 0 ? likeCount : 'Like'}
        </button>
      </div>

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

      {liveDebugEnabled && (
        <details className="rounded-lg border border-slate-200 bg-slate-50 text-[10px] text-slate-600">
          <summary className="cursor-pointer px-3 py-1.5 font-semibold text-slate-500 select-none">
            🛠 Debug Panel (dev only)
          </summary>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 px-3 py-2 font-mono">
            <dt className="font-semibold text-slate-500">Sale ID</dt>
            <dd className="truncate">{saleId}</dd>
            <dt className="font-semibold text-slate-500">Status</dt>
            <dd>{connectionStatus}</dd>
            <dt className="font-semibold text-slate-500">PC State</dt>
            <dd>{debugPcState}</dd>
            <dt className="font-semibold text-slate-500">ICE State</dt>
            <dd>{debugIceState}</dd>
            <dt className="font-semibold text-slate-500">ICE Gather</dt>
            <dd>{debugIceGatheringState}</dd>
            <dt className="font-semibold text-slate-500">Signaling</dt>
            <dd>{debugSignalingState}</dd>
            <dt className="font-semibold text-slate-500">Has Media</dt>
            <dd>{hasRemoteMedia ? 'yes' : 'no'}</dd>
            <dt className="font-semibold text-slate-500">Reconnects</dt>
            <dd>{debugReconnectAttempts} / {MAX_RECONNECT_ATTEMPTS}</dd>
            <dt className="font-semibold text-slate-500">Candidates</dt>
            <dd className="truncate">{debugRecentCandidateTypes.length > 0 ? debugRecentCandidateTypes.join(', ') : 'none'}</dd>
            <dt className="font-semibold text-slate-500">TURN</dt>
            <dd>{HAS_TURN_CONFIG ? 'configured' : 'STUN only'}</dd>
            <dt className="font-semibold text-slate-500">Audio Unlock</dt>
            <dd>{audioUnlockRequired ? 'needed' : 'ok'}</dd>
          </dl>
        </details>
      )}
    </div>
  );
}
