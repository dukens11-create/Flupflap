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
  liveSessionId?: unknown;
};

export function resolveLiveEngagementContext(
  saleId: string,
  liveStartedAt: Date | null,
  input?: LiveEngagementContextInput,
) {
  const roomId = getLiveRoomId(saleId);
  const liveSessionId = getLiveSessionId(saleId, liveStartedAt);
  const receivedRoomId = typeof input?.roomId === 'string' ? input.roomId : null;
  const receivedLiveSessionId =
    typeof input?.liveSessionId === 'string' || input?.liveSessionId === null
      ? input.liveSessionId
      : null;

  return {
    roomId,
    liveSessionId,
    receivedRoomId,
    receivedLiveSessionId,
    roomMatches: receivedRoomId == null || receivedRoomId === roomId,
    liveSessionMatches: receivedLiveSessionId == null || receivedLiveSessionId === liveSessionId,
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
