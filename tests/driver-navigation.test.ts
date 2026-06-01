import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateNavigationSnapshot,
  DEFAULT_SEGMENTS,
  DEFAULT_TURNS,
  formatDistance,
  getCompletionPercent,
  getTurnAnnouncement,
  reorderWaypoints,
  shouldRecalculateRoute,
} from '@/lib/driver-navigation';

test('formatDistance supports km and miles', () => {
  assert.equal(formatDistance(1500, 'km'), '1.5 km');
  assert.equal(formatDistance(1609, 'mi'), '1.0 mi');
});

test('getCompletionPercent returns bounded values', () => {
  assert.equal(getCompletionPercent(6000, 3000), 50);
  assert.equal(getCompletionPercent(0, 10), 100);
  assert.equal(getCompletionPercent(1000, 2000), 0);
});

test('shouldRecalculateRoute honors threshold', () => {
  assert.equal(shouldRecalculateRoute(119), false);
  assert.equal(shouldRecalculateRoute(120), true);
  assert.equal(shouldRecalculateRoute(200, 180), true);
});

test('reorderWaypoints moves element while preserving list length', () => {
  const items = [
    { id: '1', label: 'A', completed: false },
    { id: '2', label: 'B', completed: false },
    { id: '3', label: 'C', completed: false },
  ];

  const reordered = reorderWaypoints(items, 2, 0);
  assert.deepEqual(
    reordered.map((item) => item.id),
    ['3', '1', '2'],
  );
  assert.equal(reordered.length, items.length);
});

test('calculateNavigationSnapshot reports next turn, arrival label, and upcoming turns', () => {
  const snapshot = calculateNavigationSnapshot({
    totalDistanceMeters: 6000,
    traveledMeters: 450,
    currentSpeedKmh: 36,
    trafficDelayMinutes: 2,
    baselineEtaMinutes: 14,
    turns: DEFAULT_TURNS,
    segments: DEFAULT_SEGMENTS,
    now: new Date('2026-01-01T12:00:00.000Z'),
  });

  assert.equal(snapshot.nextTurn?.id, 't-1');
  assert.equal(snapshot.distanceToNextTurnMeters, 50);
  assert.equal(snapshot.currentSegmentIndex, 0);
  assert.equal(snapshot.upcomingTurns.length, 5);
  assert.equal(snapshot.arrived, false);
  assert.match(snapshot.arrivalTimeLabel, /\d{1,2}:\d{2}/);
});

test('getTurnAnnouncement emits 300m and 100m warnings once per turn', () => {
  const turn = DEFAULT_TURNS[0];
  let state = { turnId: '', warned300m: false, warned100m: false };

  const first = getTurnAnnouncement(250, turn, state);
  assert.match(first.message ?? '', /Turn right in 250m/);
  state = first.nextState;

  const repeat300 = getTurnAnnouncement(220, turn, state);
  assert.equal(repeat300.message, null);
  state = repeat300.nextState;

  const nearTurn = getTurnAnnouncement(80, turn, state);
  assert.match(nearTurn.message ?? '', /Approaching turn/);
  state = nearTurn.nextState;

  const repeat100 = getTurnAnnouncement(60, turn, state);
  assert.equal(repeat100.message, null);
});
