import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRideAction,
  calculateEarnings,
  getDriverDashboardPayload,
  resetDriverDashboardStateForTests,
  updateDriverAvailabilityStatus,
} from '@/lib/driver-dashboard-store';

test.beforeEach(() => {
  resetDriverDashboardStateForTests();
});

test('calculateEarnings returns total, daily, and weekly sums', () => {
  const now = new Date('2026-05-31T12:00:00.000Z');
  const tripHistory = [
    { id: 'trip_1', date: '2026-05-31T08:00:00.000Z', passengerName: 'A', pickupAddress: 'A', destinationAddress: 'B', earningsCents: 1200, rating: 5 },
    { id: 'trip_2', date: '2026-05-30T08:00:00.000Z', passengerName: 'B', pickupAddress: 'B', destinationAddress: 'C', earningsCents: 1600, rating: 4.9 },
    { id: 'trip_3', date: '2026-05-20T08:00:00.000Z', passengerName: 'C', pickupAddress: 'C', destinationAddress: 'D', earningsCents: 900, rating: 4.8 },
  ];

  const earnings = calculateEarnings(tripHistory, now);

  assert.equal(earnings.totalEarningsCents, 3700);
  assert.equal(earnings.dailyEarningsCents, 1200);
  assert.equal(earnings.weeklyEarningsCents, 2800);
});

test('updateDriverAvailabilityStatus updates online/offline status', () => {
  const onlinePayload = updateDriverAvailabilityStatus('online');
  assert.equal(onlinePayload.availabilityStatus, 'online');

  const offlinePayload = updateDriverAvailabilityStatus('offline');
  assert.equal(offlinePayload.availabilityStatus, 'offline');
});

test('applyRideAction removes pending request and updates acceptance rate', () => {
  const before = getDriverDashboardPayload();
  const firstRide = before.rideRequests[0];
  assert.ok(firstRide, 'expected initial pending ride request');

  const afterAccept = applyRideAction(firstRide.id, 'accept');
  assert.equal(afterAccept.rideRequests.some((ride) => ride.id === firstRide.id), false);
  assert.equal(afterAccept.rating.acceptanceRate, 100);

  const nextRide = afterAccept.rideRequests[0];
  assert.ok(nextRide, 'expected another pending ride request');

  const afterReject = applyRideAction(nextRide.id, 'reject');
  assert.equal(afterReject.rating.acceptanceRate, 50);
});

test('applyRideAction throws when ride ID is unknown', () => {
  assert.throws(() => applyRideAction('ride_unknown', 'accept'), /not found/i);
});
