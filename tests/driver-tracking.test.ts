import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateEtaMinutes,
  getAccuracyLabel,
  haversineDistanceMiles,
  normalizeSpeedMph,
  shouldApplyLocationUpdate,
} from '../lib/driver-tracking';

test('haversineDistanceMiles calculates expected distance', () => {
  const miles = haversineDistanceMiles(
    { lat: 37.7749, lng: -122.4194 },
    { lat: 37.7837, lng: -122.4089 },
  );

  assert.ok(miles > 0.7 && miles < 1.0);
});

test('normalizeSpeedMph converts meters per second and rejects invalid values', () => {
  assert.equal(normalizeSpeedMph(10)?.toFixed(2), '22.37');
  assert.equal(normalizeSpeedMph(null), null);
  assert.equal(normalizeSpeedMph(-1), null);
});

test('accuracy labels map correctly', () => {
  assert.equal(getAccuracyLabel(8), 'High');
  assert.equal(getAccuracyLabel(22), 'Medium');
  assert.equal(getAccuracyLabel(80), 'Low');
  assert.equal(getAccuracyLabel(null), 'Unavailable');
});

test('eta uses fallback speed when live speed is unavailable', () => {
  assert.equal(estimateEtaMinutes(5, null), 14);
  assert.equal(estimateEtaMinutes(5, 30), 10);
});

test('shouldApplyLocationUpdate throttles tiny updates but accepts meaningful movement', () => {
  const previous = { lat: 37.7749, lng: -122.4194, timestamp: 1000 };

  assert.equal(
    shouldApplyLocationUpdate(previous, { lat: 37.77491, lng: -122.41941, timestamp: 2000 }, { minDistanceMeters: 10, minTimeMs: 5000 }),
    false,
  );

  assert.equal(
    shouldApplyLocationUpdate(previous, { lat: 37.7755, lng: -122.4188, timestamp: 2500 }, { minDistanceMeters: 10, minTimeMs: 5000 }),
    true,
  );

  assert.equal(
    shouldApplyLocationUpdate(previous, { lat: 37.77491, lng: -122.41941, timestamp: 7000 }, { minDistanceMeters: 10, minTimeMs: 5000 }),
    true,
  );
});
