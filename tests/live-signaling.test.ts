import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SIGNAL_EVENTS,
  LIVE_SIGNAL_KINDS,
  LIVE_SIGNAL_ROLES,
  getLiveRoomId,
  getLiveSessionId,
} from '@/lib/live-signaling';

test('getLiveRoomId: returns stable room namespace for sale id', () => {
  assert.equal(getLiveRoomId('sale-123'), 'garage-sale:sale-123');
});

test('getLiveSessionId: includes sale id and session timestamp', () => {
  const sessionTime = new Date('2026-05-21T00:00:00.000Z');
  assert.equal(getLiveSessionId('sale-123', sessionTime), 'sale-123:2026-05-21T00:00:00.000Z');
});

test('getLiveSessionId: returns null when live has not started', () => {
  assert.equal(getLiveSessionId('sale-123', null), null);
});

test('live signaling constants: include normalized event names and stream-ready kind', () => {
  assert.equal(LIVE_SIGNAL_EVENTS.BROADCASTER_JOIN, 'broadcaster_join');
  assert.equal(LIVE_SIGNAL_EVENTS.VIEWER_JOIN, 'viewer_join');
  assert.equal(LIVE_SIGNAL_EVENTS.ICE_CANDIDATE, 'ice_candidate');
  assert.equal(LIVE_SIGNAL_EVENTS.STREAM_READY, 'stream_ready');
  assert.equal(LIVE_SIGNAL_KINDS.STREAM_READY, 'STREAM_READY');
  assert.equal(LIVE_SIGNAL_ROLES.SELLER, 'SELLER');
  assert.equal(LIVE_SIGNAL_ROLES.BUYER, 'BUYER');
});
