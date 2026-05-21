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

type CanonicalLiveSaleIdInput = Pick<LiveEngagementContextInput, 'saleId' | 'liveSaleId' | 'liveId' | 'streamId'>;

/**
 * Returns a string when the payload provided a concrete string value, null when
 * the payload explicitly set null, and undefined when the key was missing or
 * non-string. This lets callers preserve explicit nulls while still falling
 * back to legacy aliases when the field is absent.
 */
function readStringOrNull(value: unknown) {
  if (typeof value === 'string') return value;
  if (value === null) return null;
  return undefined;
}

/**
 * Picks the first non-empty canonical sale identifier from supported aliases in
 * precedence order: saleId, liveSaleId, liveId, then streamId.
 */
export function getCanonicalLiveSaleId(input?: CanonicalLiveSaleIdInput | null) {
  if (!input) return null;
  const normalizedCandidates = [input.saleId, input.liveSaleId, input.liveId, input.streamId]
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);
  const [firstCandidate, ...restCandidates] = normalizedCandidates;
  if (firstCandidate && new Set(normalizedCandidates).size > 1) {
    console.warn('[live-engagement] conflicting sale identifiers detected', {
      saleId: input.saleId ?? null,
      liveSaleId: input.liveSaleId ?? null,
      liveId: input.liveId ?? null,
      streamId: input.streamId ?? null,
    });
  }
  if (firstCandidate) return firstCandidate;
  return restCandidates[0] ?? null;
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
  const receivedCanonicalSaleId = getCanonicalLiveSaleId(input);

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
