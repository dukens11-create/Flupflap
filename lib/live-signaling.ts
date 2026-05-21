export const LIVE_SIGNAL_ROLES = {
  SELLER: 'SELLER',
  BUYER: 'BUYER',
} as const;

export const LIVE_SIGNAL_KINDS = {
  OFFER: 'OFFER',
  ANSWER: 'ANSWER',
  ICE: 'ICE',
  VIEWER_HEARTBEAT: 'VIEWER_HEARTBEAT',
  STREAM_READY: 'STREAM_READY',
  // Guest video call signaling (P2P negotiation after seller approval between buyer-guest and seller)
  GUEST_OFFER: 'GUEST_OFFER',
  GUEST_ANSWER: 'GUEST_ANSWER',
  GUEST_ICE: 'GUEST_ICE',
  // Backward-compatible engagement signal kinds
  MESSAGE_SENT: 'LIVE_MESSAGE_SENT',
  LIKES_UPDATE: 'LIVE_LIKES_UPDATE',
} as const;

export const LIVE_SIGNAL_EVENTS = {
  BROADCASTER_JOIN: 'broadcaster_join',
  VIEWER_JOIN: 'viewer_join',
  OFFER: 'offer',
  ANSWER: 'answer',
  ICE_CANDIDATE: 'ice_candidate',
  STREAM_READY: 'stream_ready',
  // Guest join request lifecycle events
  REQUEST_JOIN_LIVE: 'request_join_live',
  JOIN_REQUEST_RECEIVED: 'join_request_received',
  APPROVE_JOIN_REQUEST: 'approve_join_request',
  DECLINE_JOIN_REQUEST: 'decline_join_request',
  GUEST_JOINED_LIVE: 'guest_joined_live',
  GUEST_LEFT_LIVE: 'guest_left_live',
  GUEST_REMOVED: 'guest_removed',
  GUEST_MUTED: 'guest_muted',
  // Backward-compatible engagement events
  MESSAGE_SENT: 'live_message_sent',
  LIKES_UPDATE: 'live_likes_update',
} as const;

/** Maximum number of simultaneous video guests the seller allows. */
export const MAX_LIVE_GUESTS = 4;

/** Pattern for valid guest ID values (stable anonymous identifier from the buyer's browser). */
export const GUEST_ID_PATTERN = /^[a-zA-Z0-9_\-\.]+$/;

export type LiveSignalRole = (typeof LIVE_SIGNAL_ROLES)[keyof typeof LIVE_SIGNAL_ROLES];
export type LiveSignalKind = (typeof LIVE_SIGNAL_KINDS)[keyof typeof LIVE_SIGNAL_KINDS];

export function getLiveRoomId(saleId: string) {
  return `garage-sale:${saleId}`;
}

export function getLiveSessionId(saleId: string, liveStartedAt: Date | null) {
  if (!liveStartedAt) return null;
  return `${saleId}:${liveStartedAt.toISOString()}`;
}
