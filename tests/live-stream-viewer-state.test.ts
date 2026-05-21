/**
 * Tests for the live stream viewer state machine helpers (lib/live-stream-viewer-state.ts).
 *
 * These tests exercise:
 *  - reconnect attempt bounds (max 3, terminal failure on exceeding).
 *  - exponential backoff stays within the maximum ceiling.
 *  - all connection status labels are defined and non-empty.
 *  - waiting-for-publisher state is a valid status with its own label.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_MAX_DELAY_MS,
  RECONNECT_STEP_DELAY_MS,
  WAITING_FOR_PUBLISHER_TIMEOUT_MS,
  STREAM_RECONNECTING_MESSAGE,
  STREAM_TERMINAL_FAILURE_MESSAGE,
  computeReconnectDelay,
  shouldAttemptReconnect,
  getConnectionStatusLabel,
  type ViewerConnectionStatus,
} from '@/lib/live-stream-viewer-state';

// ── MAX_RECONNECT_ATTEMPTS ────────────────────────────────────────────────────

test('MAX_RECONNECT_ATTEMPTS is bounded at 3 to prevent infinite churn', () => {
  assert.equal(MAX_RECONNECT_ATTEMPTS, 3);
});

// ── shouldAttemptReconnect ────────────────────────────────────────────────────

test('shouldAttemptReconnect: allows attempts 1 through MAX', () => {
  for (let i = 1; i <= MAX_RECONNECT_ATTEMPTS; i++) {
    assert.equal(shouldAttemptReconnect(i), true, `attempt ${i} should be allowed`);
  }
});

test('shouldAttemptReconnect: rejects attempt MAX+1 (terminal failure)', () => {
  assert.equal(shouldAttemptReconnect(MAX_RECONNECT_ATTEMPTS + 1), false);
});

test('shouldAttemptReconnect: rejects any attempt above MAX', () => {
  assert.equal(shouldAttemptReconnect(MAX_RECONNECT_ATTEMPTS + 5), false);
});

// ── computeReconnectDelay ─────────────────────────────────────────────────────

test('computeReconnectDelay: first attempt equals RECONNECT_STEP_DELAY_MS', () => {
  assert.equal(computeReconnectDelay(1, 0), RECONNECT_STEP_DELAY_MS);
});

test('computeReconnectDelay: second attempt is 2x RECONNECT_STEP_DELAY_MS', () => {
  assert.equal(computeReconnectDelay(2, 0), RECONNECT_STEP_DELAY_MS * 2);
});

test('computeReconnectDelay: third attempt is 4x RECONNECT_STEP_DELAY_MS', () => {
  assert.equal(computeReconnectDelay(3, 0), RECONNECT_STEP_DELAY_MS * 4);
});

test('computeReconnectDelay: high attempt is capped at RECONNECT_MAX_DELAY_MS', () => {
  const delay = computeReconnectDelay(20, 0);
  assert.equal(delay, RECONNECT_MAX_DELAY_MS);
});

test('computeReconnectDelay: delay never exceeds ceiling even with jitter', () => {
  // Jitter is included before capping so the total never exceeds RECONNECT_MAX_DELAY_MS.
  const delay = computeReconnectDelay(20, 249);
  assert.ok(delay <= RECONNECT_MAX_DELAY_MS, `delay ${delay} exceeded ceiling ${RECONNECT_MAX_DELAY_MS}`);
});

test('computeReconnectDelay: caps at boundary when exponential first exceeds RECONNECT_MAX_DELAY_MS', () => {
  // Attempt 4 → 1200 * 2^3 = 9600, which exceeds 8000 and should be capped.
  const delay = computeReconnectDelay(4, 0);
  assert.equal(delay, RECONNECT_MAX_DELAY_MS);
});

test('computeReconnectDelay: attempt just below cap is not clamped', () => {
  // Attempt 3 → 1200 * 2^2 = 4800 < 8000, so no clamping occurs.
  const delay = computeReconnectDelay(3, 0);
  assert.ok(delay < RECONNECT_MAX_DELAY_MS);
});

// ── getConnectionStatusLabel ──────────────────────────────────────────────────

const ALL_STATUSES: ViewerConnectionStatus[] = [
  'connecting',
  'waitingForPublisher',
  'live',
  'reconnecting',
  'failed',
  'ended',
];

test('getConnectionStatusLabel: returns a non-empty string for every status', () => {
  for (const status of ALL_STATUSES) {
    const label = getConnectionStatusLabel(status);
    assert.ok(typeof label === 'string' && label.length > 0, `Missing label for status: ${status}`);
  }
});

test('getConnectionStatusLabel: live → "Live"', () => {
  assert.equal(getConnectionStatusLabel('live'), 'Live');
});

test('getConnectionStatusLabel: waitingForPublisher has distinct label', () => {
  const label = getConnectionStatusLabel('waitingForPublisher');
  assert.notEqual(label, getConnectionStatusLabel('connecting'));
  assert.notEqual(label, getConnectionStatusLabel('live'));
});

test('getConnectionStatusLabel: reconnecting label indicates reconnection attempt', () => {
  const label = getConnectionStatusLabel('reconnecting');
  assert.ok(label.toLowerCase().includes('reconnect'), `Expected "reconnect" in label, got: ${label}`);
});

test('getConnectionStatusLabel: failed label indicates inability to connect', () => {
  const label = getConnectionStatusLabel('failed');
  assert.ok(
    label.toLowerCase().includes('unable') || label.toLowerCase().includes('fail'),
    `Expected failure indication in label, got: ${label}`,
  );
});

// ── WAITING_FOR_PUBLISHER_TIMEOUT_MS ─────────────────────────────────────────

test('WAITING_FOR_PUBLISHER_TIMEOUT_MS is at least 10 seconds', () => {
  assert.ok(WAITING_FOR_PUBLISHER_TIMEOUT_MS >= 10000);
});

// ── Error messages ────────────────────────────────────────────────────────────

test('STREAM_RECONNECTING_MESSAGE is defined and non-empty', () => {
  assert.ok(typeof STREAM_RECONNECTING_MESSAGE === 'string' && STREAM_RECONNECTING_MESSAGE.length > 0);
});

test('STREAM_TERMINAL_FAILURE_MESSAGE is defined and non-empty', () => {
  assert.ok(typeof STREAM_TERMINAL_FAILURE_MESSAGE === 'string' && STREAM_TERMINAL_FAILURE_MESSAGE.length > 0);
});

test('STREAM_RECONNECTING_MESSAGE and STREAM_TERMINAL_FAILURE_MESSAGE are different', () => {
  assert.notEqual(STREAM_RECONNECTING_MESSAGE, STREAM_TERMINAL_FAILURE_MESSAGE);
});
