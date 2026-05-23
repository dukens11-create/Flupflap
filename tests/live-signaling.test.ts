import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LIVE_SIGNAL_EVENTS,
  LIVE_SIGNAL_KINDS,
  LIVE_SIGNAL_ROLES,
  getSignalLiveSessionId,
  getSignalRoomId,
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

test('getLiveRoomId: returns room ids isolated per sale', () => {
  assert.notEqual(getLiveRoomId('sale-a'), getLiveRoomId('sale-b'));
});

test('signal payload scope readers: support camelCase and snake_case aliases', () => {
  assert.equal(
    getSignalRoomId({ roomId: 'garage-sale:sale-123', room_id: 'garage-sale:other' }),
    'garage-sale:sale-123',
  );
  assert.equal(
    getSignalRoomId({ room_id: 'garage-sale:sale-123' }),
    'garage-sale:sale-123',
  );
  assert.equal(
    getSignalLiveSessionId({ liveSessionId: 'sale-123:2026-05-23T00:00:00.000Z' }),
    'sale-123:2026-05-23T00:00:00.000Z',
  );
  assert.equal(
    getSignalLiveSessionId({ live_session_id: 'sale-123:2026-05-23T00:00:00.000Z' }),
    'sale-123:2026-05-23T00:00:00.000Z',
  );
});

test('signal payload scope readers: return null for missing or empty scope fields', () => {
  assert.equal(getSignalRoomId({ roomId: '   ' }), null);
  assert.equal(getSignalRoomId({}), null);
  assert.equal(getSignalLiveSessionId({ liveSessionId: '' }), null);
  assert.equal(getSignalLiveSessionId(null), null);
});

test('live signaling constants: include normalized event names and stream-ready kind', () => {
  assert.equal(LIVE_SIGNAL_EVENTS.BROADCASTER_JOIN, 'broadcaster_join');
  assert.equal(LIVE_SIGNAL_EVENTS.VIEWER_JOIN, 'viewer_join');
  assert.equal(LIVE_SIGNAL_EVENTS.ICE_CANDIDATE, 'ice_candidate');
  assert.equal(LIVE_SIGNAL_EVENTS.STREAM_READY, 'stream_ready');
  assert.equal(LIVE_SIGNAL_EVENTS.MESSAGE_SENT, 'live_message_sent');
  assert.equal(LIVE_SIGNAL_EVENTS.LIKES_UPDATE, 'live_likes_update');
  assert.equal(LIVE_SIGNAL_KINDS.STREAM_READY, 'STREAM_READY');
  assert.equal(LIVE_SIGNAL_KINDS.MESSAGE_SENT, 'LIVE_MESSAGE_SENT');
  assert.equal(LIVE_SIGNAL_KINDS.LIKES_UPDATE, 'LIVE_LIKES_UPDATE');
  assert.equal(LIVE_SIGNAL_ROLES.SELLER, 'SELLER');
  assert.equal(LIVE_SIGNAL_ROLES.BUYER, 'BUYER');
});
