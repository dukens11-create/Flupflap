'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { MessageCircle, Send, Radio, Eye, Heart, Video, VideoOff, PhoneOff } from 'lucide-react';
import { LIVE_ENGAGEMENT_EVENTS } from '@/lib/live-engagement';
import { payloadTargetsViewer } from '@/lib/garage-sale-live-stream';
import { RTC_CONFIG, HAS_TURN_CONFIG } from '@/lib/rtc-config';
import { getIceCandidateType, type IceCandidateType } from '@/lib/rtc-diagnostics';
import { LIVE_SIGNAL_EVENTS, LIVE_SIGNAL_KINDS, LIVE_SIGNAL_ROLES, getLiveRoomId, MAX_LIVE_GUESTS } from '@/lib/live-signaling';
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

const DEFAULT_AUTHENTICATED_BUYER_NAME = 'Anonymous Buyer';
const CHAT_LOGIN_REQUIRED_MESSAGE = 'Please log in to chat';
const MEDIA_READY_TIMEOUT_MS = 1200;
const PLAYBACK_RETRY_DELAY_MS = 250;
const PLAYBACK_RECOVERY_THROTTLE_MS = 1200;
const CONNECTION_RECOVERY_TIMEOUT_MS = 8000;
const RECENT_CANDIDATE_TYPES_LIMIT = 6;

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
  initialLiveSessionId?: string | null;
  buyerName?: string | null;
  buyerId?: string | null;
  buyerAvatar?: string | null;
}

type GuestJoinStatus =
  | 'idle'
  | 'requesting-media'
  | 'pending'
  | 'waiting'
  | 'approved'
  | 'active'
  | 'declined'
  | 'removed'
  | 'full';

export default function GarageSaleBuyerLiveView({ saleId, initialIsLive, initialLiveSessionId, buyerName, buyerId, buyerAvatar }: Props) {
  const [isLive, setIsLive] = useState(initialIsLive);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
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
  const isAuthenticatedBuyer = Boolean(buyerId);

  // Guest video call state
  const [guestJoinStatus, setGuestJoinStatus] = useState<GuestJoinStatus>('idle');
  const [guestJoinError, setGuestJoinError] = useState<string | null>(null);

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
  const liveRoomIdRef = useRef<string>(getLiveRoomId(saleId));
  const liveSessionIdRef = useRef<string | null>(initialLiveSessionId ?? null);
  const lastLoggedRoomRef = useRef<string | null>(null);
  const lastLoggedSessionRef = useRef<string | null>(null);
  const streamReadySentForOfferRef = useRef<string | null>(null);
  const liveDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_LIVE_STREAM === '1';
  const liveDebugOverlayEnabled = process.env.NEXT_PUBLIC_LIVE_DEBUG_OVERLAY === 'true';

  // Guest video call refs
  const guestRequestIdRef = useRef<string | null>(null);
  const guestLocalStreamRef = useRef<MediaStream | null>(null);
  const guestPeerRef = useRef<RTCPeerConnection | null>(null);
  const guestLocalVideoRef = useRef<HTMLVideoElement | null>(null);
  const guestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const guestHasRemoteDescRef = useRef(false);
  const guestPendingIceRef = useRef<RTCIceCandidateInit[]>([]);
  const guestSignalOfferSentRef = useRef(false);
  // Stable ref so polling callbacks always see the latest status without stale closures
  const guestJoinStatusRef = useRef<GuestJoinStatus>('idle');

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

  const fetchReactionCount = useCallback(async () => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/reactions`);
      if (!res.ok) return;
      const data = await res.json() as { totalLikes: number };
      setLikeCount(data.totalLikes);
    } catch {
      // Silent fail — polling or optimistic updates will retry
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
    void fetchReactionCount();
  }, [fetchReactionCount]);

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

  const logLiveRoomDetails = useCallback((roomId: string, liveSessionId: string | null, source: string) => {
    const roomChanged = roomId !== lastLoggedRoomRef.current;
    const sessionChanged = liveSessionId !== lastLoggedSessionRef.current;
    if (roomId !== lastLoggedRoomRef.current) {
      console.info('[GarageSaleBuyerLiveView] VIEWER ROOM ID', roomId);
      console.info('[GarageSaleBuyerLiveView] SELLER ROOM ID (from signaling room)', roomId);
      lastLoggedRoomRef.current = roomId;
    }
    if (liveSessionId !== lastLoggedSessionRef.current) {
      console.info('[GarageSaleBuyerLiveView] VIEWER LIVE SESSION ID', liveSessionId ?? 'none');
      lastLoggedSessionRef.current = liveSessionId;
    }
    if (roomChanged || sessionChanged) {
      console.info('[GarageSaleBuyerLiveView] room joined successfully', { roomId, liveSessionId, source });
    }
    logLiveDebug(LIVE_SIGNAL_EVENTS.VIEWER_JOIN, {
      source,
      roomId,
      liveSessionId,
    });
    if (roomId !== getLiveRoomId(saleId)) {
      console.warn('[GarageSaleBuyerLiveView] ROOM MISMATCH', { viewerRoomId: roomId, expectedRoomId: getLiveRoomId(saleId) });
    }
  }, [logLiveDebug, saleId]);

  const postSignal = useCallback(async (
    kind: 'ANSWER' | 'ICE' | 'VIEWER_HEARTBEAT' | 'STREAM_READY',
    payload: Record<string, unknown>,
    options?: { critical?: boolean },
  ) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: LIVE_SIGNAL_ROLES.BUYER, kind, payload }),
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
    const ok = await postSignal(
      LIVE_SIGNAL_KINDS.VIEWER_HEARTBEAT,
      {
        viewerId: getViewerId(),
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
      },
    );
    if (!ok) {
      console.warn('[GarageSaleBuyerLiveView] Viewer heartbeat failed');
    }
  }, [getViewerId, isLive, postSignal]);

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
      void sendViewerHeartbeat();
      void pollSignalsRef.current?.();
    }, retryDelay);
    return true;
  }, [clearConnectionRecoveryTimeout, closePeerConnection, isLive, logLiveDebug, sendViewerHeartbeat]);

  const ensureLiveEngagementContext = useCallback(async () => {
    if (liveSessionIdRef.current) {
      return {
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
      };
    }

    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling?role=BUYER`);
      if (!res.ok) {
        console.warn('[GarageSaleBuyerLiveView] Failed to refresh live engagement context', { status: res.status });
        return {
          roomId: liveRoomIdRef.current,
          liveSessionId: liveSessionIdRef.current,
        };
      }

      const data = await res.json() as {
        roomId?: string;
        liveSessionId?: string | null;
      };

      if (typeof data.roomId === 'string') {
        liveRoomIdRef.current = data.roomId;
      }
      if (typeof data.liveSessionId === 'string' || data.liveSessionId === null) {
        liveSessionIdRef.current = data.liveSessionId ?? null;
      }
      logLiveRoomDetails(liveRoomIdRef.current, liveSessionIdRef.current, 'engagement-refresh');
    } catch {
      console.warn('[GarageSaleBuyerLiveView] Network error refreshing live engagement context');
    }

    return {
      roomId: liveRoomIdRef.current,
      liveSessionId: liveSessionIdRef.current,
    };
  }, [logLiveRoomDetails, saleId]);

  const handleSellerOffer = useCallback(async (
    signalId: string,
    payload: { type?: string; sdp?: string; viewerId?: string },
  ) => {
    const type = payload.type === 'offer' ? payload.type : null;
    if (!type || !payload.sdp) return;
    const viewerId = getViewerId();
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
      void (async () => {
        const played = await playRemoteStream();
        logLiveDebug('remote-play-result', { played, signalId });
        if (!played) return;
        const activeOfferId = activeOfferSignalRef.current;
        if (!activeOfferId || streamReadySentForOfferRef.current === activeOfferId) return;
        const sent = await postSignal(LIVE_SIGNAL_KINDS.STREAM_READY, {
          viewerId: getViewerId(),
          offerSignalId: activeOfferId,
          roomId: liveRoomIdRef.current,
          liveSessionId: liveSessionIdRef.current,
          remoteAudioTracks: remoteStream.getAudioTracks().length,
          remoteVideoTracks: remoteStream.getVideoTracks().length,
        });
        if (sent) {
          streamReadySentForOfferRef.current = activeOfferId;
          logLiveDebug(LIVE_SIGNAL_EVENTS.STREAM_READY, { offerSignalId: activeOfferId });
        }
      })();
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      const candidateType = rememberCandidateType(event.candidate.candidate);
      logPeerStates('local-ice-candidate', { candidateType });
      void postSignal(LIVE_SIGNAL_KINDS.ICE, { candidate: event.candidate.toJSON(), viewerId });
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
    logLiveDebug('set-remote-description-success', { signalId, type });
    hasRemoteDescriptionRef.current = true;
    for (const candidate of pendingRemoteIceCandidatesRef.current) {
      if (peerRef.current !== pc) break;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        logLiveDebug('add-ice-candidate-success', { source: 'buffered-before-remote-description' });
      } catch {
        // Ignore stale or incompatible candidates
        logLiveDebug('add-ice-candidate-failed', { source: 'buffered-before-remote-description' });
      }
    }
    pendingRemoteIceCandidatesRef.current = [];

    const answer = await pc.createAnswer();
    logLiveDebug('answer-created', { hasSdp: Boolean(answer.sdp), signalId });
    await pc.setLocalDescription(answer);
    logLiveDebug('set-local-description-success', { type: answer.type, signalId });
    await postSignal(LIVE_SIGNAL_KINDS.ANSWER, { type: answer.type, sdp: answer.sdp, viewerId }, { critical: true });
    logLiveDebug(LIVE_SIGNAL_EVENTS.ANSWER, { signalId });

    // Attach srcObject early so the video element is ready when tracks arrive
    if (videoRef.current) {
      videoRef.current.srcObject = remoteStream;
      void playRemoteStream();
    }
  }, [clearWaitingForPublisherTimer, closePeerConnection, getViewerId, logLiveDebug, playRemoteStream, postSignal, resetReconnectState, scheduleConnectionRecovery]);

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
        roomId?: string;
        liveSessionId?: string | null;
        viewerCount?: number;
        streamReadyCount?: number;
        signals: Array<{ id: string; kind: string; payload: unknown; createdAt: string }>;
      };

      if (typeof data.roomId === 'string') {
        liveRoomIdRef.current = data.roomId;
      }
      if (typeof data.liveSessionId === 'string' || data.liveSessionId === null) {
        liveSessionIdRef.current = data.liveSessionId ?? null;
      }
      logLiveRoomDetails(liveRoomIdRef.current, liveSessionIdRef.current, 'poll');

      if (!data.isLive) {
        setIsLive(false);
        setViewerCount(0);
        setConnectionStatus('ended');
        return;
      }

      setViewerCount(data.viewerCount ?? 0);

      for (const signal of data.signals) {
        let viewerIdForSignal: string | null = null;
        const resolveViewerId = () => {
          if (!viewerIdForSignal) viewerIdForSignal = getViewerId();
          return viewerIdForSignal;
        };

        if (signal.kind === LIVE_SIGNAL_KINDS.OFFER) {
          logLiveDebug('signal-offer', { id: signal.id, createdAt: signal.createdAt });
          // Skip already-processed offers without losing the cursor position.
          if (activeOfferSignalRef.current === signal.id) {
            signalCursorRef.current = signal.createdAt;
            continue;
          }
          const payload = signal.payload as { type?: string; sdp?: string; viewerId?: string } | null;
          if (!payload) {
            signalCursorRef.current = signal.createdAt;
            continue;
          }
          const viewerId = resolveViewerId();
          if (!payloadTargetsViewer(payload, viewerId)) {
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
        } else if (signal.kind === LIVE_SIGNAL_KINDS.ICE) {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit } | null;
          if (payload?.candidate) {
            const viewerId = resolveViewerId();
            if (!payloadTargetsViewer(payload, viewerId)) {
              signalCursorRef.current = signal.createdAt;
              continue;
            }
            const candidateType = rememberCandidateType(payload.candidate.candidate);
            logLiveDebug('signal-ice', { createdAt: signal.createdAt, candidateType });
            if (!peerRef.current || !hasRemoteDescriptionRef.current) {
              pendingRemoteIceCandidatesRef.current.push(payload.candidate);
            } else {
              try {
                await peerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
                logLiveDebug('add-ice-candidate-success', { source: 'poll' });
              } catch {
                // Ignore stale candidates from a previous peer connection
                logLiveDebug('add-ice-candidate-failed', { source: 'poll' });
              }
            }
          }
          // ICE candidates are always consumed — failures are non-fatal and the
          // candidate should not be replayed on the next poll.
          signalCursorRef.current = signal.createdAt;
        } else if (signal.kind === LIVE_SIGNAL_KINDS.GUEST_ANSWER) {
          // Seller's WebRTC answer for the guest call
          const payload = signal.payload as { type?: string; sdp?: string; requestId?: string } | null;
          if (
            payload?.sdp
            && payload?.type === 'answer'
            && guestPeerRef.current
            && !guestHasRemoteDescRef.current
          ) {
            try {
              await guestPeerRef.current.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
              guestHasRemoteDescRef.current = true;
              // Drain buffered ICE candidates
              for (const candidate of guestPendingIceRef.current) {
                if (!guestPeerRef.current) break;
                try {
                  await guestPeerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
                } catch {
                  // ignore stale
                }
              }
              guestPendingIceRef.current = [];
              logLiveDebug('guest-answer-applied', { requestId: payload.requestId });
            } catch (err) {
              console.warn('[GuestCall] Failed to apply guest answer', err);
            }
          }
          signalCursorRef.current = signal.createdAt;
        } else if (signal.kind === LIVE_SIGNAL_KINDS.GUEST_ICE) {
          // ICE candidate from seller for the guest peer connection
          const payload = signal.payload as { candidate?: RTCIceCandidateInit; requestId?: string } | null;
          if (payload?.candidate && guestPeerRef.current) {
            if (!guestHasRemoteDescRef.current) {
              guestPendingIceRef.current.push(payload.candidate);
            } else {
              try {
                await guestPeerRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
              } catch {
                // ignore stale
              }
            }
          }
          signalCursorRef.current = signal.createdAt;
        } else {
          signalCursorRef.current = signal.createdAt;
        }
      }
    } catch {
      console.warn('[GarageSaleBuyerLiveView] Network error while polling buyer signals');
    }
  }, [clearConnectionRecoveryTimeout, handleSellerOffer, isLive, logLiveDebug, logLiveRoomDetails, saleId, scheduleConnectionRecovery]);

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
      // Inline guest peer cleanup (stopGuestPeer is declared after this hook)
      guestPeerRef.current?.close();
      guestPeerRef.current = null;
      guestLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
      guestLocalStreamRef.current = null;
      if (guestPollRef.current) clearInterval(guestPollRef.current);
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

  // ── Guest Video Call ─────────────────────────────────────────────────────────

  const stopGuestPeer = useCallback(() => {
    guestPeerRef.current?.close();
    guestPeerRef.current = null;
    guestLocalStreamRef.current?.getTracks().forEach((t) => t.stop());
    guestLocalStreamRef.current = null;
    guestHasRemoteDescRef.current = false;
    guestPendingIceRef.current = [];
    guestSignalOfferSentRef.current = false;
    if (guestLocalVideoRef.current) guestLocalVideoRef.current.srcObject = null;
  }, []);

  const postGuestSignal = useCallback(async (kind: 'GUEST_OFFER' | 'GUEST_ICE', payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: LIVE_SIGNAL_ROLES.BUYER, kind, payload }),
      });
      if (!res.ok) {
        console.warn('[GuestCall] Failed to post guest signal', { kind, status: res.status });
        return false;
      }
      return true;
    } catch {
      console.warn('[GuestCall] Network error posting guest signal', { kind });
      return false;
    }
  }, [saleId]);

  const startGuestOffer = useCallback(async (requestId: string) => {
    if (!guestLocalStreamRef.current) {
      console.warn('[GuestCall] No local stream for guest offer');
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      setGuestJoinError('Live video calls are not supported in this browser.');
      return;
    }
    guestHasRemoteDescRef.current = false;
    guestPendingIceRef.current = [];
    guestSignalOfferSentRef.current = false;

    const pc = new RTCPeerConnection(RTC_CONFIG);
    guestPeerRef.current = pc;

    guestLocalStreamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, guestLocalStreamRef.current!);
    });

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postGuestSignal(LIVE_SIGNAL_KINDS.GUEST_ICE, { candidate: event.candidate.toJSON(), requestId });
    };

    pc.onconnectionstatechange = () => {
      logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_JOINED_LIVE, { state: pc.connectionState, requestId });
      if (pc.connectionState === 'connected') {
        setGuestJoinStatus('active');
        guestJoinStatusRef.current = 'active';
        console.info('[GuestCall] Guest peer connected', { requestId });
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        console.warn('[GuestCall] Guest peer connection lost', { state: pc.connectionState, requestId });
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    guestSignalOfferSentRef.current = true;
    await postGuestSignal(LIVE_SIGNAL_KINDS.GUEST_OFFER, {
      type: offer.type,
      sdp: offer.sdp,
      requestId,
      guestId: guestIdRef.current,
    });
    console.info('[GuestCall] Guest offer sent', { requestId });
  }, [logLiveDebug, postGuestSignal]);

  const handleRequestToJoin = useCallback(async () => {
    if (!isLive) return;
    setGuestJoinError(null);
    setGuestJoinStatus('requesting-media');
    guestJoinStatusRef.current = 'requesting-media';

    // 1. Request camera + mic BEFORE creating the join request (never publish until approved)
    let localStream: MediaStream | null = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: true,
      });
      guestLocalStreamRef.current = localStream;
      // Show local preview (muted so no echo)
      if (guestLocalVideoRef.current) {
        guestLocalVideoRef.current.srcObject = localStream;
        guestLocalVideoRef.current.muted = true;
        void guestLocalVideoRef.current.play().catch(() => undefined);
      }
      logLiveDebug(LIVE_SIGNAL_EVENTS.REQUEST_JOIN_LIVE, { guestId: guestIdRef.current });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      let msg = 'Could not access camera or microphone.';
      if (name === 'NotAllowedError') msg = 'Camera/microphone permission was denied. Please allow access and try again.';
      else if (name === 'NotFoundError') msg = 'No camera or microphone found on this device.';
      else if (name === 'NotReadableError') msg = 'Camera or microphone is already in use by another app or tab. Please close other applications using your camera/microphone and try again.';
      setGuestJoinError(msg);
      setGuestJoinStatus('idle');
      guestJoinStatusRef.current = 'idle';
      return;
    }

    // 2. Check room capacity
    try {
      const checkRes = await fetch(`/api/garage-sales/${saleId}/guest-requests?guestId=${encodeURIComponent(guestIdRef.current)}`);
      if (checkRes.ok) {
        const checkData = await checkRes.json() as { activeCount: number; maxGuests: number };
        if (checkData.activeCount >= checkData.maxGuests) {
          localStream.getTracks().forEach((t) => t.stop());
          guestLocalStreamRef.current = null;
          setGuestJoinStatus('full');
          guestJoinStatusRef.current = 'full';
          return;
        }
      }
    } catch {
      // Continue — the create API will also enforce the limit
    }

    // 3. Create the join request in the database
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guestId: guestIdRef.current,
          guestName: buyerName || DEFAULT_AUTHENTICATED_BUYER_NAME,
          viewerId: buyerId ?? guestIdRef.current,
          viewerAvatar: buyerAvatar ?? null,
        }),
      });
      const data = await res.json() as { request?: { id: string; status: string }; error?: string; roomFull?: boolean };
      if (!res.ok) {
        if (data.roomFull) {
          localStream.getTracks().forEach((t) => t.stop());
          guestLocalStreamRef.current = null;
          setGuestJoinStatus('full');
          guestJoinStatusRef.current = 'full';
          return;
        }
        throw new Error(data.error ?? 'Failed to send request');
      }
      if (data.request) {
        guestRequestIdRef.current = data.request.id;
        setGuestJoinStatus('pending');
        guestJoinStatusRef.current = 'pending';
        console.info('[GuestCall] Join request created', { requestId: data.request.id });
      }
    } catch (err) {
      localStream.getTracks().forEach((t) => t.stop());
      guestLocalStreamRef.current = null;
      setGuestJoinError(err instanceof Error ? err.message : 'Failed to send request');
      setGuestJoinStatus('idle');
      guestJoinStatusRef.current = 'idle';
    }
  }, [buyerAvatar, buyerId, buyerName, isLive, logLiveDebug, saleId]);

  const handleEndGuestCall = useCallback(async () => {
    const reqId = guestRequestIdRef.current;
    setGuestJoinStatus('removed');
    guestJoinStatusRef.current = 'removed';
    stopGuestPeer();
    logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_LEFT_LIVE, { requestId: reqId });
    if (reqId) {
      try {
        await fetch(`/api/garage-sales/${saleId}/guest-requests/${reqId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'end', guestId: guestIdRef.current }),
        });
        console.info('[GuestCall] Guest call ended', { requestId: reqId });
      } catch {
        // Cleanup is most important even if the API call fails
      }
    }
    guestRequestIdRef.current = null;
    setTimeout(() => {
      setGuestJoinStatus('idle');
      guestJoinStatusRef.current = 'idle';
    }, 2000);
  }, [logLiveDebug, saleId, stopGuestPeer]);

  // Poll for guest request status (approval, decline, mute, remove)
  const pollGuestStatus = useCallback(async () => {
    const currentStatus = guestJoinStatusRef.current;
    if (currentStatus === 'idle' || currentStatus === 'requesting-media' || currentStatus === 'removed') return;

    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests?guestId=${encodeURIComponent(guestIdRef.current)}`);
      if (!res.ok) return;
      const data = await res.json() as {
        request?: { id: string; status: string; isMuted: boolean } | null;
        activeCount: number;
        maxGuests: number;
        isLive: boolean;
      };

      if (!data.isLive) {
        stopGuestPeer();
        setGuestJoinStatus('removed');
        guestJoinStatusRef.current = 'removed';
        return;
      }

      const req = data.request;
      if (!req) return;

      if (req.status === 'declined') {
        logLiveDebug(LIVE_SIGNAL_EVENTS.DECLINE_JOIN_REQUEST, { requestId: req.id });
        stopGuestPeer();
        setGuestJoinStatus('declined');
        guestJoinStatusRef.current = 'declined';
        return;
      }

      if (req.status === 'removed') {
        logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_REMOVED, { requestId: req.id });
        stopGuestPeer();
        setGuestJoinStatus('removed');
        guestJoinStatusRef.current = 'removed';
        setTimeout(() => { setGuestJoinStatus('idle'); guestJoinStatusRef.current = 'idle'; }, 2000);
        return;
      }

      if (req.status === 'accepted' && (currentStatus === 'pending' || currentStatus === 'waiting')) {
        logLiveDebug(LIVE_SIGNAL_EVENTS.APPROVE_JOIN_REQUEST, { requestId: req.id });
        setGuestJoinStatus('approved');
        guestJoinStatusRef.current = 'approved';
        if (!guestSignalOfferSentRef.current && guestLocalStreamRef.current) {
          await startGuestOffer(req.id);
        }
      }

      // Reflect mute state on local audio tracks
      if (guestLocalStreamRef.current) {
        guestLocalStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !req.isMuted; });
      }
    } catch {
      // Silent fail — will retry on next interval
    }
  }, [logLiveDebug, saleId, startGuestOffer, stopGuestPeer]);

  // Start/stop guest status polling when guestJoinStatus changes to an active state
  useEffect(() => {
    const active = guestJoinStatus === 'pending' || guestJoinStatus === 'waiting'
      || guestJoinStatus === 'approved' || guestJoinStatus === 'active';
    if (active) {
      if (!guestPollRef.current) {
        void pollGuestStatus();
        guestPollRef.current = setInterval(() => { void pollGuestStatus(); }, 3000);
      }
    } else {
      if (guestPollRef.current) {
        clearInterval(guestPollRef.current);
        guestPollRef.current = null;
      }
    }
    return () => {
      if (guestPollRef.current) {
        clearInterval(guestPollRef.current);
        guestPollRef.current = null;
      }
    };
  }, [guestJoinStatus, pollGuestStatus]);

  // Clean up guest resources on unmount or when live ends
  useEffect(() => {
    if (!isLive) {
      if (guestJoinStatusRef.current !== 'idle') {
        stopGuestPeer();
        setGuestJoinStatus('idle');
        guestJoinStatusRef.current = 'idle';
        guestRequestIdRef.current = null;
      }
    }
  }, [isLive, stopGuestPeer]);

  const handleSend = async () => {
    if (sending) return;
    const trimmed = input.trim();
    if (!trimmed) return;
    if (!isAuthenticatedBuyer) {
      setError(CHAT_LOGIN_REQUIRED_MESSAGE);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const liveContext = await ensureLiveEngagementContext();
      const requestPayload = {
        liveId: saleId,
        message: trimmed,
        displayName: buyerName || DEFAULT_AUTHENTICATED_BUYER_NAME,
        userId: buyerId,
        roomId: liveContext.roomId,
        liveSessionId: liveContext.liveSessionId,
      };
      const res = await fetch(`/api/garage-sales/${saleId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
      });
      const data = await res.json().catch(() => ({}));
      console.info('[GarageSaleBuyerLiveView] chat api response', {
        status: res.status,
        ok: res.ok,
        roomId: liveContext.roomId,
        liveSessionId: liveContext.liveSessionId,
        responseMessageId: (data as { id?: string }).id,
        responseEvent: (data as { event?: string }).event,
      });
      if (!res.ok) {
        console.error('[GarageSaleBuyerLiveView] chat api error', {
          status: res.status,
          operation: 'buyer.chat.send',
          timestamp: new Date().toISOString(),
          requestPayload,
          response: data,
        });
        throw new Error((data as { error?: string }).error ?? 'Failed to send');
      }
      const msg = data as ChatMessage & { event?: string };
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        if (existingIds.has(msg.id)) return prev;
        return [...prev, msg];
      });
      lastSeenRef.current = msg.createdAt;
      setInput('');
      setError(null);
      console.info('[GarageSaleBuyerLiveView] live_message_sent', {
        roomId: liveContext.roomId,
        liveSessionId: liveContext.liveSessionId,
        messageId: msg.id,
        event: msg.event ?? LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT,
      });
    } catch (err) {
      console.error('[GarageSaleBuyerLiveView] message save error', {
        saleId,
        operation: 'buyer.chat.send',
        timestamp: new Date().toISOString(),
        liveSessionId: liveSessionIdRef.current,
        buyerId: buyerId ?? null,
        error: err instanceof Error ? err.message : 'unknown',
      });
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
      const liveContext = await ensureLiveEngagementContext();
      const res = await fetch(`/api/garage-sales/${saleId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'heart',
          guestId: guestIdRef.current,
          roomId: liveContext.roomId,
          liveSessionId: liveContext.liveSessionId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const totalLikes = (data as { totalLikes?: number }).totalLikes ?? 0;
        console.info('[GarageSaleBuyerLiveView] live_likes_update', {
          roomId: liveContext.roomId,
          liveSessionId: liveContext.liveSessionId,
          totalLikes,
          deduplicated: (data as { deduplicated?: boolean }).deduplicated ?? false,
        });
        setLikeCount(totalLikes);
      } else {
        console.warn('[GarageSaleBuyerLiveView] Like event send failed', {
          status: res.status,
          operation: 'buyer.like.send',
          timestamp: new Date().toISOString(),
          roomId: liveContext.roomId,
          liveSessionId: liveContext.liveSessionId,
        });
        await fetchReactionCount();
      }
    } catch {
      console.warn('[GarageSaleBuyerLiveView] Network error sending like event', {
        saleId,
        operation: 'buyer.like.send',
        timestamp: new Date().toISOString(),
        liveSessionId: liveSessionIdRef.current,
      });
      await fetchReactionCount();
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
  const recentCandidateTypesLabel = useMemo(() => (
    debugRecentCandidateTypes.length > 0
      ? debugRecentCandidateTypes.join(', ')
      : 'none'
  ), [debugRecentCandidateTypes]);
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
              <span className="truncate">{recentCandidateTypesLabel}</span>
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

      {/* ── Guest Join Live section ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Join Live on Video</p>

        {guestJoinStatus === 'idle' && (
          <button
            type="button"
            onClick={() => void handleRequestToJoin()}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 active:bg-indigo-800"
          >
            <Video size={15} />
            Request to Join Live
          </button>
        )}

        {guestJoinStatus === 'requesting-media' && (
          <p className="text-center text-sm text-slate-600 py-1">Requesting camera &amp; microphone…</p>
        )}

        {guestJoinStatus === 'full' && (
          <p className="text-center text-sm font-medium text-amber-700 rounded-lg bg-amber-50 px-3 py-2">
            Live guest room is full. Please wait.
          </p>
        )}

        {guestJoinStatus === 'pending' && (
          <div className="space-y-2">
            <p className="text-center text-sm text-slate-700 font-medium">
              ✉️ Request sent — waiting for seller approval
            </p>
            {/* Show local preview so user sees their camera is ready */}
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={guestLocalVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
              <span className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
                Your camera (preview only)
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleEndGuestCall()}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-100"
            >
              <PhoneOff size={13} /> Cancel Request
            </button>
          </div>
        )}

        {guestJoinStatus === 'approved' && (
          <div className="space-y-2">
            <p className="text-center text-sm text-emerald-700 font-medium">
              ✅ Accepted — connecting…
            </p>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={guestLocalVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
            </div>
            <button
              type="button"
              onClick={() => void handleEndGuestCall()}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <PhoneOff size={13} /> End Guest Call
            </button>
          </div>
        )}

        {guestJoinStatus === 'active' && (
          <div className="space-y-2">
            <p className="text-center text-sm font-bold text-emerald-700">
              🎙 You are live with seller
            </p>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-900">
              <video
                ref={guestLocalVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover scale-x-[-1]"
              />
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white animate-pulse">
                🔴 LIVE
              </span>
            </div>
            <button
              type="button"
              onClick={() => void handleEndGuestCall()}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700"
            >
              <PhoneOff size={13} /> End Guest Call
            </button>
          </div>
        )}

        {guestJoinStatus === 'declined' && (
          <div className="space-y-2">
            <p className="text-center text-sm text-red-700 font-medium rounded-lg bg-red-50 px-3 py-2">
              ❌ Seller declined your request
            </p>
            <button
              type="button"
              onClick={() => { setGuestJoinStatus('idle'); guestJoinStatusRef.current = 'idle'; }}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Try Again
            </button>
          </div>
        )}

        {guestJoinStatus === 'removed' && (
          <p className="text-center text-sm text-amber-700 font-medium rounded-lg bg-amber-50 px-3 py-2">
            ⚠️ You were removed from co-host video
          </p>
        )}

        {guestJoinError && (
          <p className="text-xs text-red-600 rounded-lg bg-red-50 px-3 py-2">{guestJoinError}</p>
        )}

        {guestJoinStatus === 'idle' && (
          <p className="text-[11px] text-slate-400 text-center">
            Up to {MAX_LIVE_GUESTS} guests can join the seller on video at once.
          </p>
        )}
      </div>

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
        {!isAuthenticatedBuyer && (
          <p className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            {CHAT_LOGIN_REQUIRED_MESSAGE}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isAuthenticatedBuyer ? 'Ask a question…' : 'Log in to send messages'}
            maxLength={500}
            disabled={!isAuthenticatedBuyer}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--ff-primary-navy)]"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!isAuthenticatedBuyer || sending || !input.trim()}
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
            <dd className="truncate">{recentCandidateTypesLabel}</dd>
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
