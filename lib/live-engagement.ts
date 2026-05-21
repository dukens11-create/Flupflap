import { getLiveRoomId, getLiveSessionId } from '@/lib/live-signaling';

export const LIVE_ENGAGEMENT_EVENTS = {
  MESSAGE_SENT: 'live_message_sent',
  LIKES_UPDATE: 'live_likes_update',
} as const;

export const LIVE_ENGAGEMENT_SIGNAL_KINDS = {
  MESSAGE_SENT: 'LIVE_MESSAGE_SENT',
  LIKES_UPDATE: 'LIVE_LIKES_UPDATE',
} as const;

type LiveEngagementContextInput = {
  roomId?: unknown;
  room_id?: unknown;
  liveSessionId?: unknown;
  live_session_id?: unknown;
  saleId?: unknown;
  liveId?: unknown;
  liveSaleId?: unknown;
  streamId?: unknown;
};

function readStringOrNull(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
}

function readCanonicalLiveSaleId(input?: LiveEngagementContextInput) {
  if (!input) return null;
  const candidates = [input.saleId, input.liveSaleId, input.liveId, input.streamId];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate;
    }
  }
  return null;
}

export function resolveLiveEngagementContext(
  saleId: string,
  liveStartedAt: Date | null,
  input?: LiveEngagementContextInput,
) {
  const roomId = getLiveRoomId(saleId);
  const liveSessionId = getLiveSessionId(saleId, liveStartedAt);
  const receivedRoomId = readStringOrNull(input?.roomId) ?? readStringOrNull(input?.room_id) ?? null;
  const receivedLiveSessionId = readStringOrNull(input?.liveSessionId) ?? readStringOrNull(input?.live_session_id) ?? null;
  const receivedCanonicalSaleId = readCanonicalLiveSaleId(input);

  return {
    roomId,
    liveSessionId,
    receivedRoomId,
    receivedLiveSessionId,
    receivedCanonicalSaleId,
    saleMatches: receivedCanonicalSaleId === null || receivedCanonicalSaleId === saleId,
    roomMatches: receivedRoomId == null || receivedRoomId === roomId,
    liveSessionMatches: receivedLiveSessionId == null || receivedLiveSessionId === liveSessionId,
  };
}

export function buildLiveEngagementIdentifiers(saleId: string) {
  return {
    saleId,
    liveSaleId: saleId,
    liveId: saleId,
    streamId: saleId,
  };
}

export function normalizeGuestId(value: unknown) {
  const trimmedGuestId = typeof value === 'string' ? value.trim() : '';
  if (!trimmedGuestId) return null;
  return /^[a-zA-Z0-9_\-\.]+$/.test(trimmedGuestId)
    ? trimmedGuestId.slice(0, 64)
    : null;
}

export function getLiveEngagementActorId(userId: string | null, guestId: string | null) {
  if (userId) return `user:${userId}`;
  if (guestId) return `guest:${guestId}`;
  return null;
}

export function isSameLiveSession(activeLiveSessionId: string | null, incomingLiveSessionId: string | null | undefined) {
  if (!incomingLiveSessionId) return true;
  if (!activeLiveSessionId) return true;
  return incomingLiveSessionId === activeLiveSessionId;
}
