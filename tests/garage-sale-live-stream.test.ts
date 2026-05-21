import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGarageSaleLiveSessionId,
  getBuyerPlaybackState,
  getSignalViewerId,
  isSellerLiveReady,
  payloadHasLiveSession,
} from '@/lib/garage-sale-live-stream';

test('seller and buyer derive the same canonical live session id for the same garage sale stream', () => {
  const liveStartedAt = new Date('2026-05-21T00:54:28.523Z');

  const sellerSessionId = buildGarageSaleLiveSessionId('sale-123', liveStartedAt);
  const buyerSessionId = buildGarageSaleLiveSessionId('sale-123', liveStartedAt.toISOString());

  assert.equal(sellerSessionId, 'sale-123:2026-05-21T00:54:28.523Z');
  assert.equal(buyerSessionId, sellerSessionId);
});

test('reconnect reuses the same canonical live session id until the live start timestamp changes', () => {
  const initialSessionId = buildGarageSaleLiveSessionId('sale-123', '2026-05-21T00:54:28.523Z');
  const reconnectSessionId = buildGarageSaleLiveSessionId('sale-123', '2026-05-21T00:54:28.523Z');
  const restartedSessionId = buildGarageSaleLiveSessionId('sale-123', '2026-05-21T00:59:28.523Z');

  assert.equal(reconnectSessionId, initialSessionId);
  assert.notEqual(restartedSessionId, initialSessionId);
});

test('live signal payloads stay scoped to the canonical live session and viewer identity', () => {
  const liveSessionId = buildGarageSaleLiveSessionId('sale-123', '2026-05-21T00:54:28.523Z');
  const payload = {
    liveSessionId,
    viewerId: 'viewer-456',
    candidate: { candidate: 'abc' },
  };

  assert.equal(payloadHasLiveSession(payload, liveSessionId), true);
  assert.equal(payloadHasLiveSession(payload, 'sale-123:other-session'), false);
  assert.equal(getSignalViewerId(payload), 'viewer-456');
  assert.equal(getSignalViewerId({ liveSessionId }), null);
});

test('seller LIVE NOW only turns on after camera, tracks, signaling join, publish, and server activation succeed', () => {
  assert.equal(isSellerLiveReady({
    cameraPermissionGranted: true,
    hasVideoTrack: true,
    hasAudioTrack: true,
    joinedSignalingRoom: true,
    publishConfirmed: true,
    serverActive: true,
  }), true);

  assert.equal(isSellerLiveReady({
    cameraPermissionGranted: true,
    hasVideoTrack: true,
    hasAudioTrack: true,
    joinedSignalingRoom: false,
    publishConfirmed: true,
    serverActive: true,
  }), false);
});

test('buyer stays in waiting state until remote tracks arrive, then transitions to live playback', () => {
  const waitingState = getBuyerPlaybackState({
    isServerLive: true,
    hasRemoteMedia: false,
    connectionStatus: 'connecting',
    recoveringConnection: false,
  });
  const liveState = getBuyerPlaybackState({
    isServerLive: true,
    hasRemoteMedia: true,
    connectionStatus: 'live',
    recoveringConnection: false,
  });

  assert.equal(waitingState.showLiveBadge, false);
  assert.equal(waitingState.waitingTitle, 'Waiting for seller video');
  assert.equal(liveState.showLiveBadge, true);
  assert.equal(liveState.statusLabel, 'Live');
});
