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
  MESSAGE_SENT: 'live_message_sent',
  LIKES_UPDATE: 'live_likes_update',
} as const;

export type LiveSignalRole = (typeof LIVE_SIGNAL_ROLES)[keyof typeof LIVE_SIGNAL_ROLES];
export type LiveSignalKind = (typeof LIVE_SIGNAL_KINDS)[keyof typeof LIVE_SIGNAL_KINDS];

export function getLiveRoomId(saleId: string) {
  return `garage-sale:${saleId}`;
}

export function getLiveSessionId(saleId: string, liveStartedAt: Date | null) {
  if (!liveStartedAt) return null;
  return `${saleId}:${liveStartedAt.toISOString()}`;
}
