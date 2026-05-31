import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RIDE_REQUEST_TIMEOUT_MS,
  applyRideRequestTimeouts,
  buildDriverRideSnapshot,
  enqueueSimulatedRideRequest,
  initializeDriverRideState,
  respondToRideRequest,
} from '@/lib/driver-ride-requests';

test('buildDriverRideSnapshot exposes the first released request and queues the rest', () => {
  const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);
  const state = initializeDriverRideState(baseTime);

  const firstSnapshot = buildDriverRideSnapshot(state, baseTime).snapshot;
  assert.ok(firstSnapshot.activeRequest);
  assert.equal(firstSnapshot.activeRequest?.passenger.name, 'Maya Thompson');
  assert.equal(firstSnapshot.queuedRequests.length, 0);

  const laterSnapshot = buildDriverRideSnapshot(state, baseTime + 23_000).snapshot;
  assert.ok(laterSnapshot.activeRequest);
  assert.equal(laterSnapshot.queuedRequests.length, 2);
  assert.equal(laterSnapshot.queuedRequests[0]?.passenger.name, 'Jordan Lee');
});

test('respondToRideRequest marks the driver on trip and clears released queue entries after accept', () => {
  const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);
  const initialState = initializeDriverRideState(baseTime);
  const queuedState = enqueueSimulatedRideRequest(initialState, baseTime + 1_000);
  const acceptedState = respondToRideRequest(queuedState, 'ride-request-1', 'accept', baseTime + 15_000);
  const snapshot = buildDriverRideSnapshot(acceptedState, baseTime + 15_000).snapshot;

  assert.equal(snapshot.driverStatus, 'ON_TRIP');
  assert.equal(snapshot.activeRequest, null);
  assert.equal(snapshot.queueCount, 0);
  assert.equal(snapshot.analytics.accepted, 1);
  assert.ok(snapshot.analytics.rejected >= 1);
});

test('applyRideRequestTimeouts records timeout responses for expired requests', () => {
  const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);
  const initialState = initializeDriverRideState(baseTime);
  const timedOutState = applyRideRequestTimeouts(initialState, baseTime + RIDE_REQUEST_TIMEOUT_MS + 500);
  const snapshot = buildDriverRideSnapshot(timedOutState, baseTime + RIDE_REQUEST_TIMEOUT_MS + 500).snapshot;

  assert.equal(snapshot.analytics.timedOut, 1);
  assert.equal(snapshot.activeRequest, null);
  assert.equal(snapshot.recentResponses[0]?.action, 'timeout');
});

test('enqueueSimulatedRideRequest adds a new immediate request to the queue', () => {
  const baseTime = Date.UTC(2026, 0, 1, 12, 0, 0);
  const initialState = initializeDriverRideState(baseTime);
  const simulatedState = enqueueSimulatedRideRequest(initialState, baseTime + 5_000);
  const snapshot = buildDriverRideSnapshot(simulatedState, baseTime + 5_000).snapshot;

  assert.equal(snapshot.queueCount, 2);
  assert.equal(snapshot.activeRequest?.id, 'ride-request-1');
  assert.ok(snapshot.queuedRequests.some((request) => request.id.startsWith('ride-request-sim-')));
});
