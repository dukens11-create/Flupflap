'use client';
import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { Video, VideoOff, Mic, MicOff, Radio, AlertTriangle, Eye, RefreshCcw, MessageCircle, Heart, Trash2, Users, PhoneCall, PhoneOff, VolumeX, Volume2, Maximize2, X } from 'lucide-react';
import { getCanonicalLiveSaleId, LIVE_ENGAGEMENT_EVENTS, LIVE_ENGAGEMENT_SIGNAL_KINDS, isSameLiveSession } from '@/lib/live-engagement';
import { getSignalViewerId, shouldRecreateGuestPeerOnOffer } from '@/lib/garage-sale-live-stream';
import { RTC_CONFIG, HAS_TURN_CONFIG } from '@/lib/rtc-config';
import { getIceCandidateType } from '@/lib/rtc-diagnostics';
import { LIVE_SIGNAL_EVENTS, LIVE_SIGNAL_KINDS, LIVE_SIGNAL_ROLES, getLiveRoomId, getLiveSessionId, MAX_LIVE_GUESTS } from '@/lib/live-signaling';
import { getStageLayoutKind, getStageGridTemplateCols, getStageGridTemplateRows, getStageTileStyle } from '@/lib/live-stage-layout';

interface Props {
  saleId: string;
  initialIsLive: boolean;
  initialLiveSessionId?: string | null;
}

interface SellerChatMessage {
  id: string;
  userId: string | null;
  guestName: string | null;
  message: string;
  createdAt: string;
}

interface GuestRequest {
  id: string;
  guestId: string;
  guestName: string | null;
  viewerId?: string | null;
  viewerAvatar?: string | null;
  status: string;
  isMuted: boolean;
  createdAt: string;
}

interface GuestPeerState {
  pc: RTCPeerConnection;
  hasRemoteDesc: boolean;
  pendingIce: RTCIceCandidateInit[];
  stream: MediaStream | null;
}

interface SellerViewerPeerState {
  pc: RTCPeerConnection;
  hasRemoteAnswer: boolean;
  pendingIce: RTCIceCandidateInit[];
  lastHeartbeatAt: number;
}

const PREVIEW_REQUIRED_MESSAGE = 'Preview your camera before starting your live garage sale.';
const CAMERA_BLOCKED_MESSAGE = 'Camera access blocked';
const CAMERA_READY_MESSAGE = 'Camera ready';
const CAMERA_CONNECTING_MESSAGE = 'Connecting camera…';
const CAMERA_PREVIEW_PLACEHOLDER = 'Camera preview will appear here.';
const CAMERA_STATUS_UNKNOWN_MESSAGE = 'Camera status unknown.';
const INSECURE_CAMERA_CONTEXT_MESSAGE = 'Camera requires HTTPS in this browser.';
const MOBILE_CAMERA_LOG_PREFIX = '[GarageSaleLivePanel][mobile-camera]';
// Give mobile browsers time to emit initial stream metadata before attempting playback.
const MEDIA_READY_TIMEOUT_MS = 1500;
// Retry once shortly after the first play() rejection for iOS/Safari startup timing quirks.
const PLAYBACK_RETRY_DELAY_MS = 120;
const SELLER_RECONNECT_MAX_ATTEMPTS = 3;
const SELLER_RECONNECT_STEP_DELAY_MS = 1200;
const SELLER_RECONNECT_MAX_DELAY_MS = 8000;
const SELLER_RECONNECT_JITTER_MS = 250;
// Buyer heartbeats are sent every 15s; 40s allows for transient misses while
// still cleaning up stale viewers promptly when they leave.
const VIEWER_HEARTBEAT_TIMEOUT_MS = 40_000;
const VIEWER_DISCONNECT_TIMEOUT_MS = 5_000;

type CameraStatus = 'idle' | 'connecting' | 'ready' | 'awaitingInteraction' | 'blocked' | 'denied' | 'unsupported';

const sleep = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms);
});

function getCameraMessageStyles(cameraStatus: CameraStatus, hasError: boolean) {
  if (cameraStatus === 'ready') return 'bg-emerald-50 text-emerald-700';
  if (cameraStatus === 'blocked' || cameraStatus === 'denied' || hasError) return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

function isSafeViewerAvatar(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export default function GarageSaleLivePanel({ saleId, initialIsLive, initialLiveSessionId }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const expandedVideoRef = useRef<HTMLVideoElement>(null);
  const expandedPreviewRef = useRef<HTMLDivElement>(null);
  /** Dedicated video element for the host tile in the live stage grid. */
  const stageSellerVideoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const viewerPeersRef = useRef<Map<string, SellerViewerPeerState>>(new Map());
  const viewerHeartbeatRef = useRef<Map<string, number>>(new Map());
  const viewerOfferInFlightRef = useRef<Set<string>>(new Set());
  const viewerDisconnectTimeoutsRef = useRef<Map<string, number>>(new Map());
  const signalPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalCursorRef = useRef<string | null>(null);
  const liveRef = useRef(initialIsLive);
  const micOnRef = useRef(true);
  const micPermissionDeniedRef = useRef(false);
  const preferredFacingModeRef = useRef<'user' | 'environment'>('user');

  const reconnectTimeoutRef = useRef<number | null>(null);
  // Always points at the latest createAndSendOffer so connection-state handlers
  // can re-offer without holding a stale closure.
  const createAndSendOfferRef = useRef<(() => Promise<void>) | null>(null);
  // Always points at the latest startSignalPolling so reconnect error paths can
  // restart polling without a stale closure.
  const startSignalPollingRef = useRef<(() => void) | null>(null);
  const reconnectRetryTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const liveRoomIdRef = useRef<string>(getLiveRoomId(saleId));
  const liveSessionIdRef = useRef<string | null>(initialLiveSessionId ?? null);
  const lastLoggedRoomRef = useRef<string | null>(null);
  const lastLoggedSessionRef = useRef<string | null>(null);

  const [isLive, setIsLive] = useState(initialIsLive);
  const [sellerPublished, setSellerPublished] = useState(false);
  const [streamReadyCount, setStreamReadyCount] = useState(0);
  const [subscriberPathReady, setSubscriberPathReady] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [showWarning, setShowWarning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isRestartingLive, setIsRestartingLive] = useState(false);
  const [liveConnectionWarning, setLiveConnectionWarning] = useState<string | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle');
  const [viewerCount, setViewerCount] = useState(0);
  const [canSwitchCamera, setCanSwitchCamera] = useState(false);
  const [currentCamera, setCurrentCamera] = useState<'front' | 'back'>('front');
  const [chatMessages, setChatMessages] = useState<SellerChatMessage[]>([]);
  const [totalLikes, setTotalLikes] = useState(0);
  const [showExpandedPreview, setShowExpandedPreview] = useState(false);
  const chatLastSeenRef = useRef<string | null>(null);
  const chatPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reactionPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Guest video call state
  const [guestRequests, setGuestRequests] = useState<GuestRequest[]>([]);
  const guestPeersRef = useRef<Map<string, GuestPeerState>>(new Map());
  const guestVideoElsRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const guestPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const liveDebugEnabled = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEBUG_LIVE_STREAM === '1';

  const logLiveDebug = useCallback((event: string, details?: Record<string, unknown>) => {
    if (!liveDebugEnabled) return;
    if (details) {
      console.info('[GarageSaleLivePanel]', event, details);
      return;
    }
    console.info('[GarageSaleLivePanel]', event);
  }, [liveDebugEnabled]);

  const logMobileCameraIssue = useCallback((issue: string, details?: Record<string, unknown>) => {
    if (details) {
      console.warn(`${MOBILE_CAMERA_LOG_PREFIX} ${issue}`, details);
      return;
    }
    console.warn(`${MOBILE_CAMERA_LOG_PREFIX} ${issue}`);
  }, []);

  const stopSignalPolling = useCallback(() => {
    if (signalPollRef.current) {
      clearInterval(signalPollRef.current);
      signalPollRef.current = null;
    }
  }, []);

  const stopChatPolling = useCallback(() => {
    if (chatPollRef.current) {
      clearInterval(chatPollRef.current);
      chatPollRef.current = null;
    }
  }, []);

  const stopReactionPolling = useCallback(() => {
    if (reactionPollRef.current) {
      clearInterval(reactionPollRef.current);
      reactionPollRef.current = null;
    }
  }, []);

  const fetchSellerChat = useCallback(async () => {
    try {
      const p = new URLSearchParams({ role: 'SELLER' });
      if (chatLastSeenRef.current) p.set('since', chatLastSeenRef.current);
      const res = await fetch(`/api/garage-sales/${saleId}/chat?${p.toString()}`);
      if (!res.ok) return;
      const data = await res.json() as { messages: SellerChatMessage[]; isLive: boolean };
      if (data.messages.length > 0) {
        setChatMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m.id));
          const newMsgs = data.messages.filter((m) => !existingIds.has(m.id));
          return newMsgs.length > 0 ? [...prev, ...newMsgs] : prev;
        });
        chatLastSeenRef.current = data.messages[data.messages.length - 1].createdAt;
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
      setTotalLikes(data.totalLikes);
    } catch {
      // Silent fail — polling will retry
    }
  }, [saleId]);

  const handleHideMessage = useCallback(async (msgId: string) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/chat/${msgId}`, { method: 'DELETE' });
      if (res.ok) {
        setChatMessages((prev) => prev.filter((m) => m.id !== msgId));
      }
    } catch {
      // Silent fail
    }
  }, [saleId]);

  // ── Guest Video Call — Seller side ───────────────────────────────────────────

  const closeGuestPeer = useCallback((requestId: string, reason: string, options?: { clearVideo?: boolean }) => {
    const peerState = guestPeersRef.current.get(requestId);
    if (!peerState) return;
    guestPeersRef.current.delete(requestId);
    peerState.pc.close();
    const shouldClearVideo = options?.clearVideo ?? true;
    if (shouldClearVideo) {
      const videoEl = guestVideoElsRef.current.get(requestId);
      if (videoEl) {
        videoEl.srcObject = null;
      }
    }
    logLiveDebug('guest-peer-closed', {
      requestId,
      reason,
      activePeers: guestPeersRef.current.size,
    });
  }, [logLiveDebug]);

  const postGuestSignal = useCallback(async (kind: 'GUEST_ANSWER' | 'GUEST_ICE', payload: Record<string, unknown>) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: LIVE_SIGNAL_ROLES.SELLER, kind, payload }),
      });
      if (!res.ok) {
        console.warn('[GuestCall] Seller failed to post guest signal', { kind, status: res.status });
        return false;
      }
      return true;
    } catch {
      console.warn('[GuestCall] Seller network error posting guest signal', { kind });
      return false;
    }
  }, [saleId]);

  /** Handle a GUEST_OFFER signal from an approved buyer-guest.
   *  Creates a peer connection, sets remote desc, sends GUEST_ANSWER. */
  const handleGuestOffer = useCallback(async (signal: {
    payload: unknown;
    createdAt: string;
  }) => {
    const payload = signal.payload as {
      type?: string;
      sdp?: string;
      requestId?: string;
      guestId?: string;
    } | null;

    if (!payload?.sdp || payload?.type !== 'offer' || !payload?.requestId) {
      console.warn('[GuestCall] Invalid GUEST_OFFER payload');
      return;
    }

    const { requestId, guestId } = payload;

    // Fetch the latest request list to verify approval (avoids stale local state)
    let isApproved = false;
    try {
      const listRes = await fetch(`/api/garage-sales/${saleId}/guest-requests`);
      if (listRes.ok) {
        const listData = await listRes.json() as { requests: GuestRequest[] };
        const req = listData.requests.find((r) => r.id === requestId);
        isApproved = Boolean(req && req.status === 'accepted');
      }
    } catch {
      // On network error, check local state as fallback
      const local = guestRequests.find((r) => r.id === requestId);
      isApproved = Boolean(local && local.status === 'accepted');
    }

    if (!isApproved) {
      console.warn('[GuestCall] GUEST_OFFER from non-approved request', { requestId });
      return;
    }

    // Avoid creating duplicate peer connections
    if (guestPeersRef.current.has(requestId)) {
      const existing = guestPeersRef.current.get(requestId)!;
      if (!existing.hasRemoteDesc) {
        try {
          await existing.pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
          existing.hasRemoteDesc = true;
          const answer = await existing.pc.createAnswer();
          await existing.pc.setLocalDescription(answer);
          await postGuestSignal(LIVE_SIGNAL_KINDS.GUEST_ANSWER, { type: answer.type, sdp: answer.sdp, requestId });
        } catch (err) {
          console.warn('[GuestCall] Failed to re-apply GUEST_OFFER to existing peer', err);
        }
      } else if (shouldRecreateGuestPeerOnOffer({
        hasRemoteDesc: existing.hasRemoteDesc,
        connectionState: existing.pc.connectionState,
        remoteDescriptionSdp: existing.pc.remoteDescription?.sdp,
        incomingOfferSdp: payload.sdp,
      })) {
        closeGuestPeer(requestId, 'new-offer-recreate', { clearVideo: false });
      } else {
        logLiveDebug('guest-offer-duplicate-ignored', {
          requestId,
          state: existing.pc.connectionState,
        });
      }
      return;
    }

    if (typeof RTCPeerConnection === 'undefined') {
      console.warn('[GuestCall] RTCPeerConnection not available');
      return;
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerState: GuestPeerState = { pc, hasRemoteDesc: false, pendingIce: [], stream: null };
    guestPeersRef.current.set(requestId, peerState);

    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      peerState.stream = stream;
      const videoEl = guestVideoElsRef.current.get(requestId);
      if (videoEl) {
        // Ensure fresh initialization to fix dark video on rejoin (esp. on iOS/Safari).
        if (videoEl.srcObject !== stream) {
          videoEl.srcObject = stream;
          videoEl.load();
        }
        void videoEl.play().catch(() => undefined);
      }
      logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_JOINED_LIVE, { requestId, guestId });
      console.info('[GuestCall] Seller received guest track', { requestId, guestId });
    };

    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      void postGuestSignal(LIVE_SIGNAL_KINDS.GUEST_ICE, { candidate: event.candidate.toJSON(), requestId });
    };

    pc.onconnectionstatechange = () => {
      logLiveDebug('guest-peer-state', { state: pc.connectionState, requestId });
      if (pc.connectionState === 'failed') {
        console.warn('[GuestCall] Guest peer failed', { requestId, state: pc.connectionState });
        closeGuestPeer(requestId, 'connection-failed');
      } else if (pc.connectionState === 'disconnected') {
        // Grace period: WebRTC connections can briefly visit 'disconnected' before
        // recovering to 'connected'. Wait 5 s before tearing down.
        window.setTimeout(() => {
          const current = guestPeersRef.current.get(requestId);
          if (current && current.pc.connectionState !== 'connected') {
            console.warn('[GuestCall] Guest peer disconnected (grace expired)', { requestId });
            closeGuestPeer(requestId, 'connection-disconnected-timeout');
          }
        }, 5000);
        logLiveDebug('guest-peer-disconnect-grace', { requestId, gracePeriodMs: 5000 });
      }
    };

    try {
      await pc.setRemoteDescription({ type: 'offer', sdp: payload.sdp });
      peerState.hasRemoteDesc = true;

      for (const candidate of peerState.pendingIce) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          logLiveDebug('guest-add-ice-candidate-failed', { requestId, error: error instanceof Error ? error.message : String(error) });
        }
      }
      peerState.pendingIce = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await postGuestSignal(LIVE_SIGNAL_KINDS.GUEST_ANSWER, { type: answer.type, sdp: answer.sdp, requestId });
      console.info('[GuestCall] Seller sent GUEST_ANSWER', { requestId });
    } catch (err) {
      console.warn('[GuestCall] Failed to handle GUEST_OFFER', err);
      closeGuestPeer(requestId, 'offer-handle-failed');
    }
  }, [closeGuestPeer, guestRequests, logLiveDebug, postGuestSignal, saleId]);

  /** Process a GUEST_ICE signal from a buyer-guest. */
  const handleGuestIce = useCallback(async (signal: { payload: unknown }) => {
    const payload = signal.payload as { candidate?: RTCIceCandidateInit; requestId?: string } | null;
    if (!payload?.candidate || !payload?.requestId) return;
    const { requestId, candidate } = payload;
    const peerState = guestPeersRef.current.get(requestId);
    if (!peerState) return;
    if (!peerState.hasRemoteDesc) {
      peerState.pendingIce.push(candidate);
      return;
    }
    try {
      await peerState.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // ignore stale
    }
  }, []);

  const pollGuestRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests`);
      if (!res.ok) return;
      const data = await res.json() as { requests: GuestRequest[]; activeCount: number; isLive: boolean };
      setGuestRequests(data.requests);

      // Close peer connections for guests that are no longer active
      for (const [reqId, peerState] of guestPeersRef.current.entries()) {
        const req = data.requests.find((r) => r.id === reqId);
        if (!req || ['declined', 'removed'].includes(req.status)) {
          closeGuestPeer(reqId, 'request-inactive');
        }
      }
    } catch {
      // Silent fail — polling will retry
    }
  }, [closeGuestPeer, saleId]);

  const handleAcceptGuest = useCallback(async (reqId: string) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      });
      if (res.ok) {
        const data = await res.json() as { request: GuestRequest };
        setGuestRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, ...data.request } : r));
        console.info('[GuestCall] Seller accepted guest', { requestId: reqId });
      }
    } catch {
      // Silent fail
    }
  }, [saleId]);

  const handleDeclineGuest = useCallback(async (reqId: string) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      });
      if (res.ok) {
        setGuestRequests((prev) => prev.filter((r) => r.id !== reqId));
        console.info('[GuestCall] Seller declined guest', { requestId: reqId });
      }
    } catch {
      // Silent fail
    }
  }, [saleId]);

  const handleRemoveGuest = useCallback(async (reqId: string) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove' }),
      });
      if (res.ok) {
        setGuestRequests((prev) => prev.filter((r) => r.id !== reqId));
        const peerState = guestPeersRef.current.get(reqId);
        if (peerState) {
          closeGuestPeer(reqId, 'seller-removed');
        }
        logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_REMOVED, { requestId: reqId });
      }
    } catch {
      // Silent fail
    }
  }, [closeGuestPeer, logLiveDebug, saleId]);

  const handleToggleMuteGuest = useCallback(async (reqId: string, currentlyMuted: boolean) => {
    const action = currentlyMuted ? 'unmute' : 'mute';
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/guest-requests/${reqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        setGuestRequests((prev) => prev.map((r) => r.id === reqId ? { ...r, isMuted: !currentlyMuted } : r));
        logLiveDebug(LIVE_SIGNAL_EVENTS.GUEST_MUTED, { requestId: reqId, isMuted: !currentlyMuted });
      }
    } catch {
      // Silent fail
    }
  }, [logLiveDebug, saleId]);

  // Ref callback to bind video elements for guest streams
  const setGuestVideoRef = useCallback((reqId: string, el: HTMLVideoElement | null) => {
    if (el) {
      guestVideoElsRef.current.set(reqId, el);
      const peerState = guestPeersRef.current.get(reqId);
      if (peerState?.stream) {
        // load() ensures a fresh media pipeline when the stream has changed,
        // preventing dark video after a guest rejoins on iOS/Safari.
        if (el.srcObject !== peerState.stream) {
          el.srcObject = peerState.stream;
          el.load();
        }
        void el.play().catch(() => undefined);
      }
    } else {
      guestVideoElsRef.current.delete(reqId);
    }
  }, []);

  const closeViewerPeer = useCallback((viewerId: string, reason: string) => {
    const disconnectTimeout = viewerDisconnectTimeoutsRef.current.get(viewerId);
    if (disconnectTimeout != null) {
      window.clearTimeout(disconnectTimeout);
      viewerDisconnectTimeoutsRef.current.delete(viewerId);
    }
    const peerState = viewerPeersRef.current.get(viewerId);
    if (!peerState) return;
    peerState.pc.close();
    viewerPeersRef.current.delete(viewerId);
    logLiveDebug('viewer-peer-closed', {
      viewerId,
      reason,
      activePeers: viewerPeersRef.current.size,
    });
  }, [logLiveDebug]);

  const closePeerConnection = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    for (const viewerId of Array.from(viewerPeersRef.current.keys())) {
      closeViewerPeer(viewerId, 'close-all');
    }
    for (const timeoutId of viewerDisconnectTimeoutsRef.current.values()) {
      window.clearTimeout(timeoutId);
    }
    viewerDisconnectTimeoutsRef.current.clear();
    viewerOfferInFlightRef.current.clear();
    viewerHeartbeatRef.current.clear();
  }, [closeViewerPeer]);

  const clearReconnectRetryTimeout = useCallback(() => {
    if (reconnectRetryTimeoutRef.current != null) {
      clearTimeout(reconnectRetryTimeoutRef.current);
      reconnectRetryTimeoutRef.current = null;
    }
  }, []);

  const resetReconnectState = useCallback(() => {
    reconnectAttemptRef.current = 0;
    clearReconnectRetryTimeout();
  }, [clearReconnectRetryTimeout]);

  const logSellerRoomDetails = useCallback((roomId: string, liveSessionId: string | null, source: string) => {
    if (roomId !== lastLoggedRoomRef.current || liveSessionId !== lastLoggedSessionRef.current) {
      console.info('[GarageSaleLivePanel] room joined successfully', { roomId, liveSessionId, source });
    }
    if (roomId !== lastLoggedRoomRef.current) {
      console.info('[GarageSaleLivePanel] SELLER ROOM ID', roomId);
      lastLoggedRoomRef.current = roomId;
    }
    if (liveSessionId !== lastLoggedSessionRef.current) {
      console.info('[GarageSaleLivePanel] SELLER LIVE SESSION ID', liveSessionId ?? 'none');
      lastLoggedSessionRef.current = liveSessionId;
    }
    logLiveDebug(LIVE_SIGNAL_EVENTS.BROADCASTER_JOIN, { source, roomId, liveSessionId });
    if (roomId !== getLiveRoomId(saleId)) {
      console.warn('[GarageSaleLivePanel] ROOM MISMATCH', { sellerRoomId: roomId, expectedRoomId: getLiveRoomId(saleId) });
    }
  }, [logLiveDebug, saleId]);

  const postSignal = useCallback(async (
    kind: 'OFFER' | 'ICE',
    payload: Record<string, unknown>,
    options?: { critical?: boolean },
  ) => {
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: LIVE_SIGNAL_ROLES.SELLER, kind, payload }),
      });
      if (res.ok) return true;

      console.warn('[GarageSaleLivePanel] Failed to post seller signal', { kind, status: res.status });
      if (options?.critical) {
        throw new Error(`Failed to post ${kind} signal`);
      }
      return false;
    } catch (error) {
      console.warn('[GarageSaleLivePanel] Network error posting seller signal', { kind });
      if (options?.critical) {
        throw error;
      }
      return false;
    }
  }, [saleId]);

  const createAndSendOfferForViewer = useCallback(async (viewerId: string, options?: { force?: boolean }) => {
    const stream = streamRef.current;
    if (!stream || !liveRef.current || !viewerId.trim()) return;
    if (typeof RTCPeerConnection === 'undefined') return;
    if (viewerOfferInFlightRef.current.has(viewerId)) return;
    if (viewerPeersRef.current.has(viewerId) && !options?.force) return;

    if (options?.force) {
      closeViewerPeer(viewerId, 'force-recreate');
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
      return;
    }

    viewerOfferInFlightRef.current.add(viewerId);

    try {
      const pc = new RTCPeerConnection(RTC_CONFIG);
      const peerState: SellerViewerPeerState = {
        pc,
        hasRemoteAnswer: false,
        pendingIce: [],
        lastHeartbeatAt: Date.now(),
      };
      viewerPeersRef.current.set(viewerId, peerState);
      logLiveDebug('viewer-peer-created', {
        viewerId,
        activePeers: viewerPeersRef.current.size,
      });

      stream.getTracks().forEach((track) => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (!event.candidate) return;
        const candidateType = getIceCandidateType(event.candidate.candidate);
        logLiveDebug('local-ice-candidate', { viewerId, candidateType });
        void postSignal(LIVE_SIGNAL_KINDS.ICE, {
          candidate: event.candidate.toJSON(),
          viewerId,
          roomId: liveRoomIdRef.current,
          liveSessionId: liveSessionIdRef.current,
        });
      };

      pc.onconnectionstatechange = () => {
        logLiveDebug('viewer-peer-state', { viewerId, state: pc.connectionState });
        if (pc.connectionState === 'connected') {
          const disconnectTimeout = viewerDisconnectTimeoutsRef.current.get(viewerId);
          if (disconnectTimeout != null) {
            window.clearTimeout(disconnectTimeout);
            viewerDisconnectTimeoutsRef.current.delete(viewerId);
          }
          setError(null);
          setLiveConnectionWarning(null);
          resetReconnectState();
        }
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          closeViewerPeer(viewerId, `connection-${pc.connectionState}`);
          return;
        }
        if (pc.connectionState === 'disconnected') {
          const existingTimeout = viewerDisconnectTimeoutsRef.current.get(viewerId);
          if (existingTimeout != null) {
            window.clearTimeout(existingTimeout);
          }
          const timeoutId = window.setTimeout(() => {
            if (!viewerPeersRef.current.has(viewerId)) return;
            const currentState = viewerPeersRef.current.get(viewerId)?.pc.connectionState;
            if (currentState === 'disconnected') {
              closeViewerPeer(viewerId, 'connection-disconnected-timeout');
            }
          }, VIEWER_DISCONNECT_TIMEOUT_MS);
          viewerDisconnectTimeoutsRef.current.set(viewerId, timeoutId);
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await postSignal(LIVE_SIGNAL_KINDS.OFFER, {
        type: offer.type,
        sdp: offer.sdp,
        viewerId,
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
      }, { critical: true });
      logLiveDebug(LIVE_SIGNAL_EVENTS.OFFER, {
        viewerId,
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
      });
      setSellerPublished(true);
    } catch (error) {
      logLiveDebug('viewer-offer-create-failed', {
        viewerId,
        error: error instanceof Error ? error.message : String(error),
      });
      closeViewerPeer(viewerId, 'offer-failed');
    } finally {
      viewerOfferInFlightRef.current.delete(viewerId);
    }
  }, [closeViewerPeer, logLiveDebug, postSignal, resetReconnectState]);

  const pollSignals = useCallback(async () => {
    // Read live state from the ref so this callback works correctly even when
    // captured in a setInterval closure before the React state update flushes.
    // Without this, the interval started by createAndSendOffer() would always
    // see isLive=false and return early, preventing the seller from ever
    // processing the buyer's ANSWER signal.
    if (!liveRef.current) return;

    try {
      const params = new URLSearchParams({ role: 'SELLER' });
      if (signalCursorRef.current) params.set('since', signalCursorRef.current);
      const res = await fetch(`/api/garage-sales/${saleId}/live/signaling?${params.toString()}`);
      if (!res.ok) {
        console.warn('[GarageSaleLivePanel] Failed to poll seller signals', { status: res.status });
        return;
      }

      const data = await res.json() as {
        isLive: boolean;
        roomId?: string;
        liveSessionId?: string | null;
        viewerCount?: number;
        streamReadyCount?: number;
        signals: Array<{ kind: string; payload: unknown; createdAt: string }>;
      };

      if (typeof data.roomId === 'string') {
        liveRoomIdRef.current = data.roomId;
      }
      if (typeof data.liveSessionId === 'string' || data.liveSessionId === null) {
        liveSessionIdRef.current = data.liveSessionId ?? null;
      }
      logSellerRoomDetails(liveRoomIdRef.current, liveSessionIdRef.current, 'poll');

      if (!data.isLive) {
        setIsLive(false);
        setSellerPublished(false);
        setStreamReadyCount(0);
        setSubscriberPathReady(false);
        setViewerCount(0);
        closePeerConnection();
        stopSignalPolling();
        return;
      }

      setViewerCount(data.viewerCount ?? 0);
      setStreamReadyCount(data.streamReadyCount ?? 0);
      if ((data.streamReadyCount ?? 0) > 0) {
        setSubscriberPathReady(true);
      }

      for (const signal of data.signals) {
        signalCursorRef.current = signal.createdAt;

        if (signal.kind === LIVE_SIGNAL_KINDS.VIEWER_HEARTBEAT) {
          const viewerId = getSignalViewerId(signal.payload);
          if (!viewerId) continue;
          const heartbeatAt = Date.now();
          viewerHeartbeatRef.current.set(viewerId, heartbeatAt);
          const peerState = viewerPeersRef.current.get(viewerId);
          if (peerState) {
            peerState.lastHeartbeatAt = heartbeatAt;
          } else {
            logLiveDebug('viewer-heartbeat-new-peer', { viewerId });
            await createAndSendOfferForViewer(viewerId);
          }
          continue;
        }

        if (signal.kind === LIVE_SIGNAL_KINDS.ANSWER) {
          const payload = signal.payload as { type?: string; sdp?: string; viewerId?: string } | null;
          const viewerId = getSignalViewerId(payload);
          if (!viewerId || !payload?.sdp || payload.type !== 'answer') continue;
          const peerState = viewerPeersRef.current.get(viewerId);
          if (!peerState || peerState.hasRemoteAnswer) continue;
          try {
            await peerState.pc.setRemoteDescription({ type: 'answer', sdp: payload.sdp });
            peerState.hasRemoteAnswer = true;
            setSubscriberPathReady(true);
            logLiveDebug(LIVE_SIGNAL_EVENTS.ANSWER, { createdAt: signal.createdAt, viewerId });
            for (const candidate of peerState.pendingIce) {
              try {
                await peerState.pc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch {
                // Ignore stale or incompatible candidates from previous reconnect attempts.
              }
            }
            peerState.pendingIce = [];
          } catch {
            closeViewerPeer(viewerId, 'answer-apply-failed');
          }
          continue;
        }

        if (signal.kind === LIVE_SIGNAL_KINDS.ICE) {
          const payload = signal.payload as { candidate?: RTCIceCandidateInit; viewerId?: string } | null;
          const viewerId = getSignalViewerId(payload);
          if (!viewerId || !payload?.candidate) continue;
          const peerState = viewerPeersRef.current.get(viewerId);
          if (!peerState) continue;
          const candidateType = getIceCandidateType(payload.candidate.candidate);
          logLiveDebug('signal-ice', { createdAt: signal.createdAt, candidateType, viewerId });
          if (!peerState.hasRemoteAnswer) {
            peerState.pendingIce.push(payload.candidate);
            continue;
          }
          try {
            await peerState.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } catch {
            // Ignore stale candidates from a previous peer connection
          }
          continue;
        }

        if (signal.kind === LIVE_SIGNAL_KINDS.STREAM_READY) {
          const payload = signal.payload as { roomId?: string } | null;
          if (payload?.roomId) {
            console.info('[GarageSaleLivePanel] VIEWER ROOM ID', payload.roomId);
            if (payload.roomId !== liveRoomIdRef.current) {
              console.warn('[GarageSaleLivePanel] ROOM MISMATCH', {
                sellerRoomId: liveRoomIdRef.current,
                viewerRoomId: payload.roomId,
              });
            }
          }
          setSubscriberPathReady(true);
          logLiveDebug(LIVE_SIGNAL_EVENTS.STREAM_READY, {
            createdAt: signal.createdAt,
            payload: signal.payload,
          });
        }

        // Handle guest video call signals from buyer
        if (signal.kind === LIVE_SIGNAL_KINDS.GUEST_OFFER) {
          await handleGuestOffer(signal);
        }

        if (signal.kind === LIVE_SIGNAL_KINDS.GUEST_ICE) {
          await handleGuestIce(signal);
        }
        if (signal.kind === LIVE_ENGAGEMENT_SIGNAL_KINDS.LIKES_UPDATE) {
          const payload = signal.payload as {
            saleId?: string;
            liveSaleId?: string;
            liveId?: string;
            streamId?: string;
            roomId?: string;
            liveSessionId?: string | null;
            totalLikes?: number;
            reactionId?: string;
          } | null;
          const payloadSaleId = getCanonicalLiveSaleId(payload);
          if (payloadSaleId && payloadSaleId !== saleId) {
            console.warn('[GarageSaleLivePanel] Ignoring live_likes_update for different sale', {
              operation: 'seller.subscription.likes',
              expectedSaleId: saleId,
              receivedSaleId: payloadSaleId,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          if (!liveSessionIdRef.current && payload?.liveSessionId) {
            liveSessionIdRef.current = payload.liveSessionId;
          }
          const sameSession = isSameLiveSession(liveSessionIdRef.current, payload?.liveSessionId);
          if (payload?.roomId && payload.roomId !== liveRoomIdRef.current) {
            console.warn('[GarageSaleLivePanel] live_likes_update room mismatch', {
              sellerRoomId: liveRoomIdRef.current,
              buyerRoomId: payload.roomId,
            });
          }
          if (!sameSession) {
            console.warn('[GarageSaleLivePanel] Ignoring live_likes_update for stale session', {
              operation: 'seller.subscription.likes',
              sellerLiveSessionId: liveSessionIdRef.current,
              buyerLiveSessionId: payload?.liveSessionId ?? null,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          if (typeof payload?.totalLikes === 'number') {
            setTotalLikes(payload.totalLikes);
          }
          console.info('[GarageSaleLivePanel] live_likes_update received', {
            roomId: payload?.roomId ?? liveRoomIdRef.current,
            liveSessionId: payload?.liveSessionId ?? liveSessionIdRef.current,
            totalLikes: payload?.totalLikes ?? totalLikes,
            reactionId: payload?.reactionId,
            operation: 'seller.subscription.likes',
            timestamp: new Date().toISOString(),
          });
        }

        if (signal.kind === LIVE_ENGAGEMENT_SIGNAL_KINDS.MESSAGE_SENT) {
          const payload = signal.payload as {
            saleId?: string;
            liveSaleId?: string;
            liveId?: string;
            streamId?: string;
            roomId?: string;
            liveSessionId?: string | null;
            message?: SellerChatMessage;
          } | null;
          const payloadSaleId = getCanonicalLiveSaleId(payload);
          if (payloadSaleId && payloadSaleId !== saleId) {
            console.warn('[GarageSaleLivePanel] Ignoring live_message_sent for different sale', {
              operation: 'seller.subscription.chat',
              expectedSaleId: saleId,
              receivedSaleId: payloadSaleId,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          if (!liveSessionIdRef.current && payload?.liveSessionId) {
            liveSessionIdRef.current = payload.liveSessionId;
          }
          const sameSession = isSameLiveSession(liveSessionIdRef.current, payload?.liveSessionId);
          if (payload?.roomId && payload.roomId !== liveRoomIdRef.current) {
            console.warn('[GarageSaleLivePanel] live_message_sent room mismatch', {
              sellerRoomId: liveRoomIdRef.current,
              buyerRoomId: payload.roomId,
            });
          }
          if (!sameSession) {
            console.warn('[GarageSaleLivePanel] Ignoring live_message_sent for stale session', {
              operation: 'seller.subscription.chat',
              sellerLiveSessionId: liveSessionIdRef.current,
              buyerLiveSessionId: payload?.liveSessionId ?? null,
              timestamp: new Date().toISOString(),
            });
            continue;
          }
          const nextMessage = payload?.message;
          if (nextMessage) {
            setChatMessages((prev) => {
              if (prev.some((message) => message.id === nextMessage.id)) return prev;
              return [...prev, nextMessage];
            });
            chatLastSeenRef.current = nextMessage.createdAt;
          }
          console.info('[GarageSaleLivePanel] live_message_sent received', {
            roomId: payload?.roomId ?? liveRoomIdRef.current,
            liveSessionId: payload?.liveSessionId ?? liveSessionIdRef.current,
            messageId: nextMessage?.id,
            operation: 'seller.subscription.chat',
            timestamp: new Date().toISOString(),
          });
        }
      }

      const cutoff = Date.now() - VIEWER_HEARTBEAT_TIMEOUT_MS;
      // Iterate over a snapshot because closeViewerPeer deletes from the map.
      for (const [viewerId, peerState] of Array.from(viewerPeersRef.current.entries())) {
        const lastHeartbeatAt = viewerHeartbeatRef.current.get(viewerId) ?? peerState.lastHeartbeatAt;
        if (lastHeartbeatAt < cutoff) {
          closeViewerPeer(viewerId, 'stale-heartbeat');
          viewerHeartbeatRef.current.delete(viewerId);
        }
      }
    } catch {
      console.warn('[GarageSaleLivePanel] Network error while polling seller signals', {
        operation: 'seller.subscription.poll',
        saleId,
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
        timestamp: new Date().toISOString(),
      });
    }
  }, [closePeerConnection, closeViewerPeer, createAndSendOfferForViewer, handleGuestIce, handleGuestOffer, logLiveDebug, logSellerRoomDetails, saleId, stopSignalPolling, totalLikes]);

  const startSignalPolling = useCallback(() => {
    stopSignalPolling();
    pollSignals();
    signalPollRef.current = setInterval(pollSignals, 2000);
  }, [pollSignals, stopSignalPolling]);

  const createAndSendOffer = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) {
      throw new Error(PREVIEW_REQUIRED_MESSAGE);
    }
    if (typeof RTCPeerConnection === 'undefined') {
      throw new Error('Live streaming is not supported in this browser.');
    }

    const videoTracks = stream.getVideoTracks();
    const audioTracks = stream.getAudioTracks();
    logLiveDebug('offer-tracks', {
      videoTracks: videoTracks.length,
      audioTracks: audioTracks.length,
      videoEnabled: videoTracks[0]?.enabled ?? false,
      audioEnabled: audioTracks[0]?.enabled ?? false,
      videoReadyState: videoTracks[0]?.readyState ?? 'none',
      audioReadyState: audioTracks[0]?.readyState ?? 'none',
    });

    if (videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
      throw new Error('Video track is not ready. Please try starting the stream again.');
    }

    signalCursorRef.current = null;
    closePeerConnection();
    setSellerPublished(false);
    setSubscriberPathReady(false);
    setStreamReadyCount(0);

    startSignalPolling();

    const now = Date.now();
    const activeViewerIds = Array.from(viewerHeartbeatRef.current.entries())
      .filter(([, heartbeatAt]) => heartbeatAt >= now - VIEWER_HEARTBEAT_TIMEOUT_MS)
      .map(([viewerId]) => viewerId);

    for (const viewerId of activeViewerIds) {
      await createAndSendOfferForViewer(viewerId, { force: true });
    }
  }, [closePeerConnection, createAndSendOfferForViewer, logLiveDebug, startSignalPolling]);

  // Keep the ref current so connection-state handlers can always call the latest version.
  useEffect(() => {
    createAndSendOfferRef.current = createAndSendOffer;
  }, [createAndSendOffer]);

  // Keep the ref current so reconnect error paths can restart polling without a stale closure.
  useEffect(() => {
    startSignalPollingRef.current = startSignalPolling;
  }, [startSignalPolling]);

  // Sync liveRef so connection-state handlers have an up-to-date value without
  // capturing stale closure state.  This prevents zombie re-offer attempts after
  // the seller ends the live session.
  useEffect(() => {
    liveRef.current = isLive;
  }, [isLive]);

  useEffect(() => {
    micOnRef.current = micOn;
  }, [micOn]);

  const ensurePreviewPlayback = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', 'true');
    video.setAttribute('webkit-playsinline', 'true');

    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      await new Promise<void>((resolve) => {
        let settled = false;
        let timeoutId: ReturnType<typeof setTimeout>;
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onReady);
          video.removeEventListener('loadeddata', onReady);
          video.removeEventListener('canplay', onReady);
          clearTimeout(timeoutId);
        };
        const finish = () => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve();
        };
        const onReady = () => {
          finish();
        };

        video.addEventListener('loadedmetadata', onReady, { once: true });
        video.addEventListener('loadeddata', onReady, { once: true });
        video.addEventListener('canplay', onReady, { once: true });

        timeoutId = setTimeout(() => {
          finish();
        }, MEDIA_READY_TIMEOUT_MS);
      });
    }

    try {
      await video.play();
      setPreviewReady(true);
      setCameraStatus('ready');
      return true;
    } catch {
      try {
        await sleep(PLAYBACK_RETRY_DELAY_MS);
        await video.play();
        setPreviewReady(true);
        setCameraStatus('ready');
        return true;
      } catch {
        setPreviewReady(false);
        setCameraStatus('awaitingInteraction');
        return false;
      }
    }
  }, []);

  const startCamera = useCallback(async (nextFacingMode = preferredFacingModeRef.current) => {
    if (cameraStatus === 'connecting') {
      return false;
    }
    if (!window.isSecureContext) {
      logMobileCameraIssue('insecure context', { protocol: window.location.protocol });
      setCameraStatus('blocked');
      setError(INSECURE_CAMERA_CONTEXT_MESSAGE);
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      logMobileCameraIssue('media device unavailable', { reason: 'getUserMedia unsupported' });
      setCameraStatus('unsupported');
      setError('Your browser does not support live camera preview.');
      return false;
    }

    if (navigator.permissions?.query) {
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'camera' });
        if (permissionStatus.state === 'denied') {
          logMobileCameraIssue('permission denied', { source: 'permissions.query' });
          setCameraStatus('denied');
          setError(null);
          return false;
        }
        if (permissionStatus.state === 'prompt') {
          setCameraStatus('idle');
        }
      } catch {
        // Ignore unsupported camera permission query implementations.
      }
    }

    setError(null);
    setCameraStatus('connecting');
    setPreviewReady(false);
    try {
      streamRef.current?.getTracks().forEach((track) => track.stop());

      // Android Chrome/Samsung Internet PWAs reliably trigger permission prompts
      // when getUserMedia(video+audio) is requested before facingMode constraints.
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      const [videoTrack] = stream.getVideoTracks();
      if (!videoTrack) {
        logMobileCameraIssue('media device unavailable', { reason: 'missing video track' });
        stream.getTracks().forEach((track) => track.stop());
        throw new Error('Camera device unavailable.');
      }

      try {
        await videoTrack.applyConstraints({ facingMode: { ideal: nextFacingMode } });
      } catch (constraintError) {
        logMobileCameraIssue('camera constraint fallback', {
          reason: 'facingMode not applied',
          facingMode: nextFacingMode,
          error: constraintError instanceof Error ? constraintError.message : 'unknown',
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCamOn(true);
      setCurrentCamera(nextFacingMode === 'user' ? 'front' : 'back');
      logLiveDebug('local-stream-created', {
        roomId: liveRoomIdRef.current,
        tracks: stream.getTracks().map((track) => ({
          id: track.id,
          kind: track.kind,
          enabled: track.enabled,
          readyState: track.readyState,
          muted: 'muted' in track ? track.muted : undefined,
        })),
      });
      const previewStarted = await ensurePreviewPlayback();
      if (!previewStarted) {
        logMobileCameraIssue('stream initialization failure', { reason: 'preview playback blocked' });
      }
      return true;
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setCamOn(false);
      streamRef.current = null;
      setPreviewReady(false);
      // SecurityError generally indicates camera access is blocked by browser/security policy,
      // while NotAllowedError usually means the user denied permission for this session.
      if (name === 'SecurityError') {
        logMobileCameraIssue('insecure context', { error: name });
        setCameraStatus('blocked');
        setError(null);
      } else if (name === 'NotAllowedError') {
        logMobileCameraIssue('permission denied', { error: name });
        setCameraStatus('denied');
        setError(null);
      } else if (name === 'NotFoundError') {
        logMobileCameraIssue('media device unavailable', { error: name });
        setCameraStatus('idle');
        setError('Camera or microphone is unavailable on this device.');
      } else if (name === 'NotReadableError') {
        logMobileCameraIssue('stream initialization failure', { error: name });
        setCameraStatus('idle');
        setError('Camera is busy in another app. Close other apps and try again.');
      } else {
        logMobileCameraIssue('stream initialization failure', {
          error: name || (err instanceof Error ? err.message : 'unknown'),
        });
        setCameraStatus('idle');
        setError(err instanceof Error ? err.message : 'Unable to connect to your camera right now.');
      }
      return false;
    }
  }, [cameraStatus, ensurePreviewPlayback, logMobileCameraIssue]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamOn(false);
    setPreviewReady(false);
    setCameraStatus('idle');
  }, []);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const newVal = !micOn;
    streamRef.current.getAudioTracks().forEach((t) => { t.enabled = newVal; });
    setMicOn(newVal);
  }, [micOn]);

  const handleSwitchCamera = useCallback(async () => {
    if (cameraStatus === 'connecting') return;
    const nextCamera = currentCamera === 'front' ? 'back' : 'front';
    const nextFacingMode = nextCamera === 'back' ? 'environment' : 'user';

    setCameraStatus('connecting');
    setError(null);

    // Stop current video tracks only; keep audio tracks alive.
    const existingAudioTracks = streamRef.current?.getAudioTracks() ?? [];
    streamRef.current?.getVideoTracks().forEach((t) => t.stop());

    let newVideoStream: MediaStream | null = null;
    try {
      if (nextCamera === 'back') {
        try {
          // First attempt: exact environment constraint.
          newVideoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { exact: 'environment' } },
            audio: false,
          });
        } catch {
          // Fallback: non-exact environment constraint.
          try {
            newVideoStream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment' },
              audio: false,
            });
          } catch (err) {
            const name = err instanceof DOMException ? err.name : '';
            logMobileCameraIssue('media device unavailable', { reason: 'back camera not found', error: name });
            setError('Back camera is not available on this device.');
            setCameraStatus('ready');
            return;
          }
        }
      } else {
        newVideoStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
      }

      const [newVideoTrack] = newVideoStream.getVideoTracks();
      if (!newVideoTrack) {
        newVideoStream.getTracks().forEach((t) => t.stop());
        setError(nextCamera === 'back' ? 'Back camera is not available on this device.' : 'Camera unavailable.');
        setCameraStatus('ready');
        return;
      }

      // Build a unified stream: new video track + existing audio tracks.
      const newStream = new MediaStream([newVideoTrack, ...existingAudioTracks]);
      streamRef.current = newStream;
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }

      // If live, replace the video track across all active viewer peers.
      if (isLive) {
        for (const peerState of viewerPeersRef.current.values()) {
          const videoSender = peerState.pc.getSenders().find((s) => s.track?.kind === 'video');
          if (videoSender) {
            try {
              await videoSender.replaceTrack(newVideoTrack);
            } catch (replaceErr) {
              logMobileCameraIssue('camera constraint fallback', {
                reason: 'replaceTrack failed during live switch',
                error: replaceErr instanceof Error ? replaceErr.message : 'unknown',
              });
            }
          }
        }
      }

      setCurrentCamera(nextCamera);
      // Keep the ref in sync so startCamera uses the correct default facing mode.
      preferredFacingModeRef.current = nextFacingMode;
      try {
        await ensurePreviewPlayback();
      } catch {
        // ensurePreviewPlayback handles its own state; set a safe fallback if it throws.
        setCameraStatus('ready');
      }
    } catch (err) {
      logMobileCameraIssue('stream initialization failure', {
        reason: 'camera switch failed',
        error: err instanceof Error ? err.message : 'unknown',
      });
      setError(err instanceof Error ? err.message : 'Failed to switch camera.');
      setCameraStatus('ready');
    }
  }, [cameraStatus, currentCamera, ensurePreviewPlayback, isLive, logMobileCameraIssue]);

  const handleGoLiveClick = () => {
    setShowWarning(true);
  };

  const confirmGoLive = async () => {
    setShowWarning(false);
    setLoading(true);
    setError(null);
    try {
      if (!streamRef.current) {
        const cameraStarted = await startCamera();
        if (!cameraStarted || !streamRef.current) {
          throw new Error(PREVIEW_REQUIRED_MESSAGE);
        }
      }
      if (
        micOnRef.current
        && !micPermissionDeniedRef.current
        && streamRef.current
        && streamRef.current.getAudioTracks().length === 0
      ) {
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          const audioTracks = audioStream.getAudioTracks();
          if (audioTracks.length === 0) {
            throw new Error('No microphone track available');
          }
          audioTracks.forEach((audioTrack) => {
            audioTrack.enabled = true;
            streamRef.current?.addTrack(audioTrack);
          });
          micPermissionDeniedRef.current = false;
        } catch (err) {
          const errorName = err instanceof DOMException ? err.name : '';
          if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
            micPermissionDeniedRef.current = true;
          }
          setMicOn(false);
          micOnRef.current = false;
        }
      }

      const res = await fetch(`/api/garage-sales/${saleId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to start live');
      }
      const liveData = await res.json() as { liveStartedAt?: string | null };
      setIsLive(true);
      setSellerPublished(false);
      setStreamReadyCount(0);
      setSubscriberPathReady(false);
      liveSessionIdRef.current = getLiveSessionId(saleId, liveData.liveStartedAt ? new Date(liveData.liveStartedAt) : null);
      logSellerRoomDetails(liveRoomIdRef.current, liveSessionIdRef.current, 'start-live');
      logLiveDebug('seller-publish-start', {
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
        hasStream: Boolean(streamRef.current),
        videoTracks: streamRef.current?.getVideoTracks().length ?? 0,
        audioTracks: streamRef.current?.getAudioTracks().length ?? 0,
      });
      // Keep liveRef in sync immediately so the pollSignals closure running
      // inside the setInterval (started by createAndSendOffer below) sees the
      // correct live state before the React re-render has a chance to flush.
      liveRef.current = true;
      await createAndSendOffer();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start live session');
    } finally {
      setLoading(false);
    }
  };

  const handleEndLive = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/garage-sales/${saleId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'end' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to end live');
      }
      setIsLive(false);
      setSellerPublished(false);
      setSubscriberPathReady(false);
      setStreamReadyCount(0);
      resetReconnectState();
      setViewerCount(0);
      setLiveConnectionWarning(null);
      stopSignalPolling();
      closePeerConnection();
      stopCamera();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to end live session');
    } finally {
      setLoading(false);
    }
  };

  const restartLiveConnection = useCallback(async () => {
    if (!liveRef.current) return;
    setIsRestartingLive(true);
    setLiveConnectionWarning(null);
    setError(null);
    try {
      // Close old peer connection and stop signal polling
      stopSignalPolling();
      closePeerConnection();

      // Reacquire camera/mic if the video tracks have ended
      const stream = streamRef.current;
      const videoTracks = stream?.getVideoTracks() ?? [];
      if (!stream || videoTracks.length === 0 || videoTracks[0].readyState !== 'live') {
        const cameraStarted = await startCamera();
        if (!cameraStarted) {
          throw new Error('Failed to reacquire camera. Please allow camera access and try again.');
        }
      }

      // Reset liveStartedAt on the server and clear old signals so that stale
      // ANSWER/ICE signals from the previous session are not applied to the new peer.
      const res = await fetch(`/api/garage-sales/${saleId}/live`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? 'Failed to restart live connection');
      }

      // Send a fresh WebRTC offer to viewers
      await createAndSendOffer();
    } catch (err) {
      setLiveConnectionWarning(err instanceof Error ? err.message : 'Failed to restart live connection');
    } finally {
      setIsRestartingLive(false);
    }
  }, [closePeerConnection, createAndSendOffer, saleId, startCamera, stopSignalPolling]);

  const endLiveOnPageLeave = useCallback(() => {
    if (!liveRef.current) return;

    const payload = JSON.stringify({ action: 'end' });
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        `/api/garage-sales/${saleId}/live`,
        new Blob([payload], { type: 'application/json' }),
      );
      return;
    }

    void fetch(`/api/garage-sales/${saleId}/live`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => undefined);
  }, [saleId]);

  // Clean up stream and connection on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      clearReconnectRetryTimeout();
      endLiveOnPageLeave();
      stopSignalPolling();
      stopChatPolling();
      stopReactionPolling();
      closePeerConnection();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      // Clean up all guest peer connections
      for (const reqId of Array.from(guestPeersRef.current.keys())) {
        closeGuestPeer(reqId, 'component-unmount');
      }
      if (guestPollRef.current) clearInterval(guestPollRef.current);
    };
  }, [clearReconnectRetryTimeout, closeGuestPeer, closePeerConnection, endLiveOnPageLeave, stopChatPolling, stopReactionPolling, stopSignalPolling]);

  // Start/stop guest request polling when live state changes
  useEffect(() => {
    if (isLive) {
      void pollGuestRequests();
      guestPollRef.current = setInterval(() => { void pollGuestRequests(); }, 3000);
    } else {
      if (guestPollRef.current) {
        clearInterval(guestPollRef.current);
        guestPollRef.current = null;
      }
      // Close all guest peers when live ends
      for (const reqId of Array.from(guestPeersRef.current.keys())) {
        closeGuestPeer(reqId, 'live-ended');
      }
      setGuestRequests([]);
    }
    return () => {
      if (guestPollRef.current) {
        clearInterval(guestPollRef.current);
        guestPollRef.current = null;
      }
    };
  }, [closeGuestPeer, isLive, pollGuestRequests]);

  // Start/stop chat + reaction polling when live state changes
  useEffect(() => {
    if (isLive) {
      startSignalPolling();
      console.info('[GarageSaleLivePanel] seller subscription connected', {
        operation: 'seller.subscription.connected',
        saleId,
        roomId: liveRoomIdRef.current,
        liveSessionId: liveSessionIdRef.current,
        subscriptions: [LIVE_ENGAGEMENT_EVENTS.MESSAGE_SENT, LIVE_ENGAGEMENT_EVENTS.LIKES_UPDATE],
        timestamp: new Date().toISOString(),
      });
      chatLastSeenRef.current = null;
      void fetchSellerChat();
      chatPollRef.current = setInterval(fetchSellerChat, 5000);
      void fetchReactionCount();
      reactionPollRef.current = setInterval(fetchReactionCount, 10000);
    } else {
      stopSignalPolling();
      stopChatPolling();
      stopReactionPolling();
    }
    return () => {
      stopSignalPolling();
      stopChatPolling();
      stopReactionPolling();
    };
  }, [isLive, fetchSellerChat, fetchReactionCount, saleId, startSignalPolling, stopChatPolling, stopReactionPolling, stopSignalPolling]);

  // Auto-scroll chat to newest message
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  useEffect(() => {
    const hasTouchUi = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!navigator.mediaDevices?.enumerateDevices && !hasTouchUi) return;

    let cancelled = false;
    const detectCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) {
          const videoInputs = devices.filter((device) => device.kind === 'videoinput').length;
          setCanSwitchCamera(hasTouchUi || videoInputs > 1);
        }
      } catch {
        if (!cancelled) {
          setCanSwitchCamera(hasTouchUi);
        }
      }
    };

    void detectCameras();
    return () => {
      cancelled = true;
    };
  }, [camOn]);

  useEffect(() => {
    window.addEventListener('pagehide', endLiveOnPageLeave);
    window.addEventListener('beforeunload', endLiveOnPageLeave);

    return () => {
      window.removeEventListener('pagehide', endLiveOnPageLeave);
      window.removeEventListener('beforeunload', endLiveOnPageLeave);
    };
  }, [endLiveOnPageLeave]);

  const cameraStatusLabel = (() => {
    switch (cameraStatus) {
      case 'connecting':
        return CAMERA_CONNECTING_MESSAGE;
      case 'ready':
        return CAMERA_READY_MESSAGE;
      case 'awaitingInteraction':
        return 'Tap to resume preview';
      case 'blocked':
        return 'Camera blocked';
      case 'denied':
        return 'Permission needed';
      case 'unsupported':
        return 'Unsupported';
      default:
        return 'Not ready';
    }
  })();

  const cameraMessage = (() => {
    if (error) return error;
    switch (cameraStatus) {
      case 'blocked':
        return CAMERA_BLOCKED_MESSAGE;
      case 'denied':
        return CAMERA_BLOCKED_MESSAGE;
      case 'unsupported':
        return 'Camera preview is not supported in this browser.';
      case 'ready':
        return CAMERA_READY_MESSAGE;
      case 'connecting':
        return CAMERA_CONNECTING_MESSAGE;
      case 'awaitingInteraction':
        return 'Tap to resume preview playback.';
      case 'idle':
        return PREVIEW_REQUIRED_MESSAGE;
      default:
        return CAMERA_STATUS_UNKNOWN_MESSAGE;
    }
  })();

  const videoPreviewClassName = camOn
    ? `h-full w-full rounded-2xl object-cover transition-opacity duration-500 ${previewReady ? 'opacity-100' : 'opacity-0'}`
    : 'hidden';
  const sellerLiveReady = isLive && sellerPublished && (subscriberPathReady || streamReadyCount > 0);
  const recentMessages = chatMessages.slice(-3).reverse();

  // ── Stage layout ────────────────────────────────────────────────────────────
  const activeGuests = useMemo(
    () => guestRequests.filter((r) => r.status === 'accepted'),
    [guestRequests],
  );
  const pendingRequests = useMemo(
    () => guestRequests.filter((r) => r.status === 'pending'),
    [guestRequests],
  );
  const incomingRequest = pendingRequests[0] ?? null;
  const stageParticipantCount = 1 + activeGuests.length; // host + accepted guests
  const stageLayout = getStageLayoutKind(stageParticipantCount);
  const stageGridCols = getStageGridTemplateCols(stageLayout);
  const stageGridRows = getStageGridTemplateRows(stageLayout);

  const syncVideoElement = useCallback((element: HTMLVideoElement | null) => {
    if (!element || !streamRef.current) return;
    if (element.srcObject !== streamRef.current) {
      element.srcObject = streamRef.current;
    }
    void element.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    syncVideoElement(videoRef.current);
  }, [camOn, previewReady, showExpandedPreview, syncVideoElement]);

  useEffect(() => {
    syncVideoElement(stageSellerVideoRef.current);
  }, [isLive, previewReady, syncVideoElement]);

  useEffect(() => {
    if (!showExpandedPreview) return;
    syncVideoElement(expandedVideoRef.current);
  }, [showExpandedPreview, syncVideoElement]);

  const handleFullscreenExpandedPreview = useCallback(async () => {
    const element = expandedPreviewRef.current;
    if (!element || typeof element.requestFullscreen !== 'function') return;
    try {
      await element.requestFullscreen();
    } catch {
      console.warn('[GarageSaleLivePanel] Fullscreen preview request failed');
    }
  }, []);

  return (
    <div className="card space-y-4 p-4 sm:space-y-5 sm:p-5 transition-all duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
          <Radio size={13} /> Live Preview
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {camOn && (
            <button
              type="button"
              onClick={() => setShowExpandedPreview(true)}
              className="btn-outline flex items-center gap-1.5 px-3 text-xs"
            >
              <Maximize2 size={13} />
              <span>Enlarge Video</span>
            </button>
          )}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
            cameraStatus === 'ready'
              ? 'bg-emerald-50 text-emerald-700'
              : cameraStatus === 'connecting'
                ? 'bg-slate-100 text-slate-600'
                : 'bg-amber-50 text-amber-700'
          }`}>
            <span className={`h-2 w-2 rounded-full ${
              cameraStatus === 'ready'
                ? 'animate-pulse bg-emerald-500'
                : cameraStatus === 'connecting'
                  ? 'animate-pulse bg-slate-400'
                  : 'bg-amber-500'
            }`} />
            {cameraStatusLabel}
          </span>
          {isLive && (
            <>
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold text-white ${sellerLiveReady ? 'animate-pulse bg-red-500' : 'bg-amber-500'}`}>
                {sellerLiveReady ? '🔴 LIVE NOW' : '🟠 Starting live…'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                <Eye size={12} /> {viewerCount} watching • {streamReadyCount} ready
              </span>
            </>
          )}
        </div>
      </div>

      <div className={`relative flex aspect-[3/4] min-h-[22rem] w-full items-center justify-center overflow-hidden rounded-2xl bg-slate-900 sm:aspect-video sm:min-h-0 ${isLive ? 'hidden' : ''}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={videoPreviewClassName}
        />
        {!camOn && (
          <div className="flex flex-col items-center gap-2 px-4 text-center text-slate-300">
            <VideoOff size={40} />
            <p className="text-sm font-medium">{CAMERA_PREVIEW_PLACEHOLDER}</p>
          </div>
        )}
        {camOn && cameraStatus === 'connecting' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/45 px-4 transition-opacity duration-300">
            <span className="rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-900 shadow">
              {CAMERA_CONNECTING_MESSAGE}
            </span>
          </div>
        )}
        {camOn && cameraStatus === 'awaitingInteraction' && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/55 p-4">
            <button
              type="button"
              onClick={() => void ensurePreviewPlayback()}
              className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg transition hover:bg-slate-100"
            >
              Tap to resume preview
            </button>
          </div>
        )}
      </div>

      {/* ── TikTok-style live stage (shown only while live) ──────────────────── */}
      {isLive && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-950 shadow-xl">
          {/* Live indicator bar */}
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-slate-900/80">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white ${sellerLiveReady ? 'animate-pulse bg-red-500' : 'bg-amber-500'}`}>
              {sellerLiveReady ? '🔴 LIVE' : '🟠 Starting…'}
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300">
              <Eye size={11} /> {viewerCount}
              {activeGuests.length > 0 && (
                <span className="ml-1.5 text-indigo-300">• {activeGuests.length}/{MAX_LIVE_GUESTS} guests</span>
              )}
            </span>
          </div>
          {/* Participant grid */}
          <div
            className="w-full"
            style={{
              display: 'grid',
              gridTemplateColumns: stageGridCols,
              gridTemplateRows: stageGridRows,
              height: 'clamp(260px, 42vh, 420px)',
              gap: '2px',
            }}
          >
            {/* Host tile — seller's own camera */}
            <div
              className="relative overflow-hidden bg-slate-900"
              style={getStageTileStyle(stageLayout, 0)}
            >
              <video
                ref={stageSellerVideoRef}
                autoPlay
                playsInline
                muted
                className={camOn ? 'h-full w-full object-cover scale-x-[-1]' : 'hidden'}
              />
              {!camOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400">
                  <VideoOff size={28} />
                  <span className="text-[10px]">Camera off</span>
                </div>
              )}
              {/* Name + status overlay */}
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                <span className="text-[11px] font-semibold text-white truncate flex-1">
                  You (Host)
                </span>
                {!micOn && <MicOff size={11} className="shrink-0 text-red-400" />}
                <span className="rounded bg-amber-500 px-1 py-0.5 text-[9px] font-bold text-white" aria-hidden="true">HOST</span>
              </div>
            </div>

            {/* Guest tiles */}
            {activeGuests.map((req, idx) => {
              const isGuestLive = Boolean(guestPeersRef.current.get(req.id)?.stream);
              return (
                <div
                  key={req.id}
                  className="relative overflow-hidden bg-slate-900"
                  style={getStageTileStyle(stageLayout, idx + 1)}
                >
                  <video
                    ref={(el) => setGuestVideoRef(req.id, el)}
                    autoPlay
                    playsInline
                    muted={req.isMuted}
                    className="h-full w-full object-cover"
                  />
                  {/* Camera off / connecting placeholder */}
                  {!isGuestLive && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-900 text-slate-400">
                      <Video size={24} className="animate-pulse" />
                      <span className="text-[10px]">Connecting…</span>
                    </div>
                  )}
                  {/* Name + controls overlay */}
                  <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1.5">
                    <span className="text-[11px] font-semibold text-white truncate flex-1">
                      {req.guestName ?? 'Guest'}
                    </span>
                    {req.isMuted && <MicOff size={10} className="shrink-0 text-red-400" />}
                    {/* Host-only tile controls */}
                    <button
                      type="button"
                      onClick={() => void handleToggleMuteGuest(req.id, req.isMuted)}
                      title={req.isMuted ? 'Unmute guest' : 'Mute guest'}
                      className="rounded bg-black/50 p-0.5 text-white hover:bg-black/75 transition-colors"
                    >
                      {req.isMuted ? <Volume2 size={12} /> : <VolumeX size={12} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleRemoveGuest(req.id)}
                      title="Remove guest from stage"
                      className="rounded bg-red-600/70 p-0.5 text-white hover:bg-red-600 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          {incomingRequest && (
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-start justify-end p-2 sm:p-3">
              <div
                role="dialog"
                aria-live="polite"
                aria-labelledby={`incoming-call-title-${incomingRequest.id}`}
                className="pointer-events-auto w-full max-w-60 rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-sm sm:w-64"
              >
                <p id={`incoming-call-title-${incomingRequest.id}`} className="text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                  +Incoming call+
                </p>
                <div className="mt-2 flex items-center gap-2.5">
                  {isSafeViewerAvatar(incomingRequest.viewerAvatar) ? (
                    <img
                      src={incomingRequest.viewerAvatar as string}
                      alt={incomingRequest.guestName ?? 'Guest avatar'}
                      className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-white/15"
                    />
                  ) : (
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">
                      {(incomingRequest.guestName ?? 'G').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="min-w-0 truncate text-sm font-semibold text-white">
                    {incomingRequest.guestName ?? 'Guest'}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDeclineGuest(incomingRequest.id)}
                    aria-label={`Decline call from ${incomingRequest.guestName ?? 'Guest'}`}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-red-600 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700"
                  >
                    <PhoneOff size={12} /> Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleAcceptGuest(incomingRequest.id)}
                    aria-label={`Accept call from ${incomingRequest.guestName ?? 'Guest'}`}
                    disabled={activeGuests.length >= MAX_LIVE_GUESTS}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PhoneCall size={12} /> Accept
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {cameraMessage && (
        <p className={cx('rounded-lg px-3 py-2 text-xs font-medium', getCameraMessageStyles(cameraStatus, Boolean(error)))}>
          {cameraMessage}
        </p>
      )}
      {isLive && !HAS_TURN_CONFIG && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          TURN relay is not configured. Some mobile viewers may fail to connect.
        </p>
      )}
      {(cameraStatus === 'denied' || cameraStatus === 'blocked') && !camOn && (
        <button
          type="button"
          onClick={() => void startCamera()}
          disabled={loading}
          className="btn-outline w-full text-xs disabled:opacity-60"
        >
          Retry Camera Permission
        </button>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!camOn ? (
          <button
            type="button"
            onClick={() => void startCamera()}
            disabled={loading || cameraStatus === 'connecting'}
            className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
          >
            <Video size={13} /> {cameraStatus === 'connecting' ? CAMERA_CONNECTING_MESSAGE : 'Preview Camera'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={stopCamera}
              disabled={loading}
              className="btn-outline flex-1 flex items-center justify-center gap-1.5 text-xs disabled:opacity-60"
            >
              <VideoOff size={13} /> Stop Camera
            </button>
            {canSwitchCamera && (
              <button
                type="button"
                onClick={() => void handleSwitchCamera()}
                disabled={loading || cameraStatus === 'connecting'}
                className="btn-outline flex items-center justify-center gap-1.5 px-3 text-xs disabled:opacity-60"
                title="Switch camera"
              >
                <RefreshCcw size={13} />
                <span>{currentCamera === 'front' ? 'Use Back Camera' : 'Use Front Camera'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={toggleMic}
              disabled={loading}
              className="btn-outline flex items-center justify-center gap-1.5 px-3 text-xs disabled:opacity-60"
              title={micOn ? 'Mute microphone' : 'Unmute microphone'}
            >
              {micOn ? <Mic size={13} /> : <MicOff size={13} />}
              <span className="sm:hidden">{micOn ? 'Mute Mic' : 'Unmute Mic'}</span>
            </button>
          </>
        )}
      </div>

      {!isLive ? (
        <button
          type="button"
          onClick={handleGoLiveClick}
          disabled={loading || !camOn}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition-all duration-300 hover:bg-black disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500"
        >
          <Radio size={14} /> {loading ? 'Starting…' : 'Start Live'}
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => void restartLiveConnection()}
            disabled={loading || isRestartingLive}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            <RefreshCcw size={14} /> {isRestartingLive ? 'Restarting…' : 'Restart Live Connection'}
          </button>
          <button
            type="button"
            onClick={handleEndLive}
            disabled={loading || isRestartingLive}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
          >
            <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
            <VideoOff size={14} /> {loading ? 'Ending…' : 'End Live'}
          </button>
        </div>
      )}

      {liveConnectionWarning && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {liveConnectionWarning}
        </p>
      )}

      <p className="text-center text-[11px] text-slate-400">
        Temporary live stream only • recordings are not stored • your stream ends automatically if you leave this page.
      </p>

      {/* Live engagement panel — chat + likes (shown only when live) */}
      {isLive && (
        <div className="space-y-4 border-t border-slate-100 pt-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-red-600">❤️ Total likes</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-semibold text-red-700">
                <Heart size={16} className="fill-red-500 text-red-500" />
                {totalLikes}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Viewer count</p>
              <p className="mt-1 flex items-center gap-1 text-lg font-semibold text-slate-800">
                <Eye size={16} />
                {viewerCount}
              </p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-indigo-600">Recent messages</p>
              <div className="mt-1 space-y-1">
                {recentMessages.length === 0 ? (
                  <p className="text-xs text-indigo-500">Waiting for first question…</p>
                ) : (
                  recentMessages.map((message) => (
                    <p key={message.id} className="truncate text-xs text-indigo-700">
                      <span className="font-semibold">{message.guestName ?? 'Buyer'}:</span> {message.message}
                    </p>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Live Guest Requests panel */}
          <div className="space-y-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-indigo-700">
              <Users size={13} /> Live Guest Requests
              {activeGuests.length > 0 && (
                <span className="ml-auto inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                  {activeGuests.length} / {MAX_LIVE_GUESTS} live
                </span>
              )}
            </h3>

            {pendingRequests.length === 0 && activeGuests.length === 0 && (
              <p className="text-center text-xs text-slate-400 py-1">No join requests yet.</p>
            )}

            {pendingRequests.length > 0 && (
              <p className="text-center text-xs text-emerald-700 py-1">
                Incoming call request is shown on the live video overlay.
              </p>
            )}

            {activeGuests.length > 0 && pendingRequests.length === 0 && (
              <p className="text-center text-xs text-emerald-600 py-1">
                {activeGuests.length} guest{activeGuests.length > 1 ? 's' : ''} on stage — manage via video tiles above.
              </p>
            )}
          </div>
          {/* Live Questions / Chat */}
          <div className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
              <MessageCircle size={13} /> Live Questions / Chat
            </h3>
            <div
              role="log"
              aria-live="polite"
              aria-label="Live chat messages"
              className="h-52 overflow-y-auto space-y-2 rounded-xl bg-slate-50 p-3 text-sm"
            >
              {chatMessages.length === 0 ? (
                <p className="mt-8 text-center text-xs text-slate-400">No questions yet.</p>
              ) : (
                chatMessages.map((m) => (
                  <div key={m.id} className="group flex items-start gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-bold text-indigo-700">
                      {(m.guestName ?? 'U').charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-[11px] font-semibold text-slate-700 truncate">
                          {m.guestName ?? 'Buyer'}
                        </span>
                        <span className="text-[10px] text-slate-400 shrink-0">
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-slate-600 text-xs break-words">{m.message}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleHideMessage(m.id)}
                      title="Hide message"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50"
                      aria-label="Hide message"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))
              )}
              <div ref={chatBottomRef} />
            </div>
          </div>
        </div>
      )}

      {showExpandedPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
          <div
            ref={expandedPreviewRef}
            className="relative flex h-full max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-slate-950 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Expanded live preview"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
              <div>
                <p className="text-sm font-semibold">Seller live preview</p>
                <p className="text-xs text-slate-300">Review your camera in a larger view before or during the live sale.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleFullscreenExpandedPreview()}
                  className="rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/10"
                >
                  Fullscreen
                </button>
                <button
                  type="button"
                  onClick={() => setShowExpandedPreview(false)}
                  className="rounded-full border border-white/15 p-2 text-white transition hover:bg-white/10"
                  aria-label="Close enlarged live preview"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-3 sm:p-6">
              <video
                ref={expandedVideoRef}
                autoPlay
                playsInline
                muted
                aria-label="Enlarged seller camera preview"
                className={camOn ? 'h-full w-full rounded-2xl object-contain' : 'hidden'}
              />
              {!camOn && (
                <div className="flex flex-col items-center gap-3 text-center text-slate-300">
                  <VideoOff size={40} />
                  <p className="text-sm font-medium">Start camera preview to enlarge the live view.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle size={20} className="text-amber-600" />
              </div>
              <h3 className="font-bold text-slate-900 text-lg">Privacy Notice</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed">
              <strong>You are about to broadcast live</strong> — people can see and hear you.
              Your camera and microphone will be active for this temporary stream only.
              Recordings are not stored, and the stream will end automatically if you leave this page.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWarning(false)}
                className="btn-outline flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmGoLive}
                className="btn-brand flex-1"
              >
                Go Live
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
