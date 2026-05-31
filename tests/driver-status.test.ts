import assert from 'node:assert/strict';
import test from 'node:test';
import {
  clampInactivityMinutes,
  formatLastOnlineTime,
  shouldAutoOffline,
} from '@/lib/driver-status';

test('clampInactivityMinutes keeps values in supported range', () => {
  assert.equal(clampInactivityMinutes(0), 1);
  assert.equal(clampInactivityMinutes(30), 30);
  assert.equal(clampInactivityMinutes(999), 180);
  assert.equal(clampInactivityMinutes(Number.NaN), 30);
});

test('shouldAutoOffline returns true only after inactivity threshold', () => {
  const now = 10_000_000;
  assert.equal(shouldAutoOffline(now - 5 * 60_000, 10, now), false);
  assert.equal(shouldAutoOffline(now - 10 * 60_000, 10, now), true);
  assert.equal(shouldAutoOffline(now - 20 * 60_000, 10, now), true);
  assert.equal(shouldAutoOffline(0, 10, now), false);
});

test('formatLastOnlineTime returns fallback for missing/invalid dates', () => {
  assert.equal(formatLastOnlineTime(null), 'Last online: —');
  assert.equal(formatLastOnlineTime('invalid-date'), 'Last online: —');
  assert.match(formatLastOnlineTime('2026-05-31T20:00:00.000Z'), /^Last online: /);
});
