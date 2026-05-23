export type LiveConnectionStatus =
  | 'connecting'
  | 'waitingForPublisher'
  | 'live'
  | 'reconnecting'
  | 'failed'
  | 'ended';

export function buildGarageSaleLiveSessionId(
  saleId: string,
  liveStartedAt: Date | string | null | undefined,
) {
  if (!liveStartedAt) return null;

  const parsed = liveStartedAt instanceof Date ? liveStartedAt : new Date(liveStartedAt);
  if (Number.isNaN(parsed.getTime())) return null;

  return `${saleId}:${parsed.toISOString()}`;
}

export function payloadHasLiveSession(
  payload: unknown,
  liveSessionId: string | null,
): payload is Record<string, unknown> & { liveSessionId: string } {
  if (!liveSessionId || !payload || typeof payload !== 'object') return false;
  return (payload as { liveSessionId?: unknown }).liveSessionId === liveSessionId;
}

export function getSignalViewerId(payload: unknown) {
  if (!payload || typeof payload !== 'object') return null;

  const viewerId = (payload as { viewerId?: unknown }).viewerId;
  return typeof viewerId === 'string' && viewerId.trim() ? viewerId : null;
}

export function payloadTargetsViewer(payload: unknown, viewerId: string) {
  const targetViewerId = getSignalViewerId(payload);
  if (!targetViewerId) return true;
  return targetViewerId === viewerId;
}

type SellerLiveReadyInput = {
  cameraPermissionGranted: boolean;
  hasVideoTrack: boolean;
  hasAudioTrack: boolean;
  joinedSignalingRoom: boolean;
  publishConfirmed: boolean;
  serverActive: boolean;
};

export function isSellerLiveReady({
  cameraPermissionGranted,
  hasVideoTrack,
  hasAudioTrack,
  joinedSignalingRoom,
  publishConfirmed,
  serverActive,
}: SellerLiveReadyInput) {
  return cameraPermissionGranted
    && hasVideoTrack
    && hasAudioTrack
    && joinedSignalingRoom
    && publishConfirmed
    && serverActive;
}

type BuyerPlaybackStateInput = {
  isServerLive: boolean;
  hasRemoteMedia: boolean;
  connectionStatus: LiveConnectionStatus;
  recoveringConnection: boolean;
};

export function getBuyerPlaybackState({
  isServerLive,
  hasRemoteMedia,
  connectionStatus,
  recoveringConnection,
}: BuyerPlaybackStateInput) {
  if (!isServerLive || connectionStatus === 'ended') {
    return {
      showLiveBadge: false,
      statusLabel: 'Stream ended',
      statusTone: 'bg-slate-200 text-slate-700',
      waitingTitle: 'Seller is offline',
      waitingDetail: 'Check back when the seller starts a live stream.',
    };
  }

  if (hasRemoteMedia && connectionStatus === 'live') {
    return {
      showLiveBadge: true,
      statusLabel: 'Live',
      statusTone: 'bg-emerald-100 text-emerald-700',
      waitingTitle: '',
      waitingDetail: '',
    };
  }

  if (connectionStatus === 'failed') {
    return {
      showLiveBadge: false,
      statusLabel: 'Unable to connect',
      statusTone: 'bg-red-100 text-red-700',
      waitingTitle: 'Unable to connect to seller video',
      waitingDetail: 'Please try again in a moment.',
    };
  }

  if (recoveringConnection || connectionStatus === 'reconnecting') {
    return {
      showLiveBadge: false,
      statusLabel: 'Reconnecting…',
      statusTone: 'bg-amber-100 text-amber-800',
      waitingTitle: 'Reconnecting to seller stream…',
      waitingDetail: 'Trying to restore the live video feed.',
    };
  }

  if (connectionStatus === 'waitingForPublisher') {
    return {
      showLiveBadge: false,
      statusLabel: 'Waiting for stream…',
      statusTone: 'bg-slate-100 text-slate-600',
      waitingTitle: 'Waiting for seller stream…',
      waitingDetail: "The seller has started a session but hasn't sent a video stream yet. Please wait.",
    };
  }

  return {
    showLiveBadge: false,
    statusLabel: 'Seller camera is starting…',
    statusTone: 'bg-slate-100 text-slate-700',
    waitingTitle: 'Waiting for seller video',
    waitingDetail: 'The seller is live, but remote video and audio have not arrived yet.',
  };
}
