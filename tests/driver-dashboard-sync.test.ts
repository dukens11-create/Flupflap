import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateAverageSpeedKph,
  calculateDistanceKm,
  calculateEtaMinutes,
  calculateTrackedDistanceKm,
  calculateTripEarnings,
  normalizeDriverRecord,
  normalizeRideCollection,
  summarizeEarnings,
  trimLocationHistory,
  type LocationRecord,
} from '@/lib/driver-dashboard/sync';

test('normalizeDriverRecord clamps invalid values and preserves known statuses', () => {
  const normalized = normalizeDriverRecord({
    name: '  Alice   Driver  ',
    email: 'alice@example.com',
    rating: 7,
    status: 'online',
    vehicle_info: { make: 'Tesla', model: 'Model 3', plate: 'ABC123' },
    last_location: { latitude: 91, longitude: -181, timestamp: '2026-06-01T00:00:00Z' },
  }, 'driver-1');

  assert.equal(normalized.driver_id, 'driver-1');
  assert.equal(normalized.name, 'Alice Driver');
  assert.equal(normalized.rating, 5);
  assert.equal(normalized.status, 'online');
  assert.equal(normalized.vehicle_info.make, 'Tesla');
  assert.deepEqual(normalized.last_location, {
    latitude: 90,
    longitude: -180,
    timestamp: '2026-06-01T00:00:00.000Z',
  });
});

test('normalizeRideCollection sorts newest rides first', () => {
  const rides = normalizeRideCollection({
    first: {
      ride_id: 'ride-a',
      driver_id: 'driver-1',
      passenger_name: 'Earlier Passenger',
      pickup: { address: 'A', latitude: 0, longitude: 0, timestamp: '2026-06-01T00:00:00Z' },
      dropoff: { address: 'B', latitude: 0, longitude: 1, timestamp: '2026-06-01T00:00:00Z' },
      status: 'requested',
      created_at: '2026-06-01T00:00:00Z',
      updated_at: '2026-06-01T00:00:00Z',
    },
    second: {
      ride_id: 'ride-b',
      driver_id: 'driver-1',
      passenger_name: 'Later Passenger',
      pickup: { address: 'C', latitude: 0, longitude: 0, timestamp: '2026-06-02T00:00:00Z' },
      dropoff: { address: 'D', latitude: 0, longitude: 1, timestamp: '2026-06-02T00:00:00Z' },
      status: 'accepted',
      created_at: '2026-06-02T00:00:00Z',
      updated_at: '2026-06-02T00:00:00Z',
    },
  }, 'driver-1');

  assert.equal(rides[0]?.ride_id, 'ride-b');
  assert.equal(rides[1]?.ride_id, 'ride-a');
});

test('trimLocationHistory keeps only the most recent items in chronological order', () => {
  const locations: LocationRecord[] = [
    { location_id: '1', driver_id: 'driver-1', latitude: 0, longitude: 0, timestamp: '2026-06-01T00:00:00Z', accuracy: 5 },
    { location_id: '2', driver_id: 'driver-1', latitude: 0, longitude: 0.1, timestamp: '2026-06-01T00:00:05Z', accuracy: 5 },
    { location_id: '3', driver_id: 'driver-1', latitude: 0, longitude: 0.2, timestamp: '2026-06-01T00:00:10Z', accuracy: 5 },
  ];

  const trimmed = trimLocationHistory(locations, 2);

  assert.deepEqual(trimmed.map((location) => location.location_id), ['2', '3']);
});

test('distance, tracked distance, speed, and ETA helpers stay internally consistent', () => {
  const segmentDistance = calculateDistanceKm(
    { latitude: 37.7749, longitude: -122.4194 },
    { latitude: 37.7849, longitude: -122.4094 },
  );

  assert.ok(segmentDistance > 1 && segmentDistance < 2);

  const locations: LocationRecord[] = [
    { location_id: '1', driver_id: 'driver-1', latitude: 37.7749, longitude: -122.4194, timestamp: '2026-06-01T00:00:00Z', accuracy: 5 },
    { location_id: '2', driver_id: 'driver-1', latitude: 37.7849, longitude: -122.4094, timestamp: '2026-06-01T00:05:00Z', accuracy: 5 },
  ];

  const trackedDistance = calculateTrackedDistanceKm(locations);
  const averageSpeed = calculateAverageSpeedKph(locations);
  const etaMinutes = calculateEtaMinutes(trackedDistance, averageSpeed);

  assert.ok(trackedDistance > 1 && trackedDistance < 2);
  assert.ok(averageSpeed > 10 && averageSpeed < 30);
  assert.equal(etaMinutes, 5);
});

test('calculateTripEarnings returns a positive fare with surge and time components', () => {
  const breakdown = calculateTripEarnings({
    distanceKm: 12,
    durationMinutes: 30,
    tip: 5,
    bonus: 2,
    surgeMultiplier: 1.25,
  });

  assert.ok(breakdown.base > 0);
  assert.ok(breakdown.distance > 0);
  assert.ok(breakdown.time > 0);
  assert.ok(breakdown.surge > 0);
  assert.ok(breakdown.total > breakdown.base + breakdown.distance + breakdown.time);
});

test('summarizeEarnings computes balances and time buckets from earnings and payments', () => {
  const summary = summarizeEarnings(
    [
      { earnings_id: 'a', driver_id: 'driver-1', amount: 20, trip_id: 'trip-a', date: '2026-06-01T12:00:00Z', type: 'base' },
      { earnings_id: 'b', driver_id: 'driver-1', amount: 5, trip_id: 'trip-a', date: '2026-05-29T12:00:00Z', type: 'tip' },
      { earnings_id: 'c', driver_id: 'driver-1', amount: 8, trip_id: 'trip-b', date: '2026-05-01T12:00:00Z', type: 'bonus' },
    ],
    [
      { payment_id: 'p1', driver_id: 'driver-1', amount: 10, status: 'completed', method: 'wallet', date: '2026-06-01T18:00:00Z' },
      { payment_id: 'p2', driver_id: 'driver-1', amount: 7, status: 'pending', method: 'wallet', date: '2026-06-02T18:00:00Z' },
    ],
    new Date('2026-06-02T12:00:00Z'),
  );

  assert.equal(summary.totalEarned, 33);
  assert.equal(summary.daily, 20);
  assert.equal(summary.weekly, 25);
  assert.equal(summary.monthly, 25);
  assert.equal(summary.pendingPayments, 7);
  assert.equal(summary.completedPayments, 10);
  assert.equal(summary.walletBalance, 23);
  assert.equal(summary.byType.base, 20);
  assert.equal(summary.byType.tip, 5);
  assert.equal(summary.byType.bonus, 8);
});
