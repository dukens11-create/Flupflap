import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTripState,
  DEFAULT_TRIP_CONFIG,
  getTripSummary,
  getTripUiState,
  haversineDistanceMeters,
  reduceTripState,
} from '@/lib/trip-lifecycle';

function createBaseState() {
  return createTripState({
    pickupAddress: '123 Pickup St',
    dropoffAddress: '789 Dropoff Ave',
    pickupLocation: { lat: 37.7749, lng: -122.4194 },
    dropoffLocation: { lat: 37.7849, lng: -122.4094 },
    initialLocation: { lat: 37.7705, lng: -122.425 },
  });
}

test('auto-arrives at pickup within 50m and starts waiting timer + notification', () => {
  let state = createBaseState();

  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
    speedMps: 8,
  });

  assert.equal(state.status, 'ARRIVED_AT_PICKUP');
  assert.equal(state.waitingTimer.active, true);
  assert.equal(state.waitingTimer.label, '10:00');
  assert.ok(state.notifications.includes('ARRIVAL_NOTIFICATION'));

  const ui = getTripUiState(state);
  assert.equal(ui.headerStatus, 'Arrived at Pickup');
  assert.equal(ui.showPickupAddressConfirmation, true);
  assert.equal(ui.showPassengerNotArrivedIndicator, true);
  assert.ok(ui.availableButtons.includes('cancelTrip'));
});

test('waiting timer tracks countdown, color transitions, and 5-minute beep', () => {
  let state = createBaseState();
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
    speedMps: 6,
  });

  assert.equal(state.waitingTimer.color, 'green');

  state = reduceTripState(state, { type: 'TICK_WAITING_TIMER', seconds: 301 });
  assert.equal(state.waitingTimer.shouldBeep, true);
  assert.equal(state.waitingTimer.color, 'orange');

  state = reduceTripState(state, { type: 'TICK_WAITING_TIMER', seconds: 300 });
  assert.equal(state.waitingTimer.color, 'red');
});

test('no-show requires timeout and explicit confirmation', () => {
  let state = createBaseState();
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
  });

  state = reduceTripState(state, { type: 'MARK_NO_SHOW', confirmed: true });
  assert.equal(state.status, 'ARRIVED_AT_PICKUP');
  assert.match(state.lastError ?? '', /before wait timeout/i);

  state = reduceTripState(state, {
    type: 'TICK_WAITING_TIMER',
    seconds: DEFAULT_TRIP_CONFIG.noShowTimeoutSeconds,
  });
  state = reduceTripState(state, { type: 'MARK_NO_SHOW', confirmed: false });
  assert.equal(state.status, 'ARRIVED_AT_PICKUP');
  assert.match(state.lastError ?? '', /confirmation/i);

  state = reduceTripState(state, { type: 'MARK_NO_SHOW', confirmed: true });
  assert.equal(state.status, 'NO_SHOW');
  assert.equal(state.totalEarningsCents, DEFAULT_TRIP_CONFIG.noShowFeeCents);
  assert.ok(state.notifications.includes('NO_SHOW_NOTIFICATION'));
});

test('start trip requires passenger in vehicle and enables end trip workflow', () => {
  let state = createBaseState();
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
  });

  state = reduceTripState(state, { type: 'START_TRIP', passengerCount: 1 });
  assert.equal(state.status, 'ARRIVED_AT_PICKUP');
  assert.match(state.lastError ?? '', /confirmation/i);

  state = reduceTripState(state, { type: 'SET_PASSENGER_IN_VEHICLE', inVehicle: true });
  const arrivedUi = getTripUiState(state);
  assert.ok(arrivedUi.availableButtons.includes('startTrip'));

  state = reduceTripState(state, {
    type: 'START_TRIP',
    passengerCount: 2,
    receiptPhotoUrl: 'https://example.com/receipt.jpg',
  });
  assert.equal(state.status, 'TRIP_STARTED');
  assert.ok(state.notifications.includes('TRIP_START_CONFIRMATION'));

  const startedUi = getTripUiState(state);
  assert.deepEqual(startedUi.availableButtons, ['endTrip']);
});

test('GPS automation detects destination arrival, end trip, and completion summary', () => {
  let state = createBaseState();
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
    speedMps: 10,
  });
  state = reduceTripState(state, { type: 'SET_PASSENGER_IN_VEHICLE', inVehicle: true });
  state = reduceTripState(state, { type: 'START_TRIP', passengerCount: 1 });

  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.779, lng: -122.414 },
    speedMps: 12,
  });
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.78492, lng: -122.40938 },
    speedMps: 7,
  });

  assert.ok(state.notifications.includes('APPROACHING_DESTINATION_ALERT'));

  state = reduceTripState(state, {
    type: 'END_TRIP',
    tipsCents: 250,
    passengerRating: 5,
    driverNotes: 'Smooth drop-off',
  });

  assert.equal(state.status, 'TRIP_ENDED');
  assert.ok(state.totalEarningsCents > 0);
  assert.ok(state.notifications.includes('TRIP_END_NOTIFICATION'));
  assert.ok(state.notifications.includes('RATING_REQUEST_NOTIFICATION'));

  const summary = getTripSummary(state);
  assert.equal(summary.pickupAddress, '123 Pickup St');
  assert.equal(summary.dropoffAddress, '789 Dropoff Ave');
  assert.ok(summary.distanceMeters > 0);
  assert.equal(summary.passengerRating, 5);

  state = reduceTripState(state, { type: 'COMPLETE_TRIP', driverNotes: 'Completed successfully' });
  assert.equal(state.status, 'TRIP_COMPLETED');
});

test('cancel trip applies reason-based cancellation fees and logs action', () => {
  let state = createBaseState();
  state = reduceTripState(state, {
    type: 'GPS_UPDATE',
    location: { lat: 37.77495, lng: -122.41945 },
  });

  state = reduceTripState(state, {
    type: 'CANCEL_TRIP',
    reason: 'Passenger not arriving',
    notes: 'Waited too long at pickup',
  });

  assert.equal(state.status, 'TRIP_CANCELLED');
  assert.equal(state.cancellationFeeCents, DEFAULT_TRIP_CONFIG.cancellationFeeCents);
  assert.equal(state.totalEarningsCents, DEFAULT_TRIP_CONFIG.cancellationFeeCents);
  assert.ok(state.notifications.includes('CANCELLATION_NOTIFICATION'));
  assert.equal(state.log.at(-1)?.event, 'TRIP_CANCELLED');
});

test('distance helper validates geofence threshold behavior', () => {
  const pickup = { lat: 37.7749, lng: -122.4194 };
  const nearby = { lat: 37.7751, lng: -122.4194 };
  const far = { lat: 37.7849, lng: -122.4094 };

  assert.ok(haversineDistanceMeters(pickup, nearby) < 50);
  assert.ok(haversineDistanceMeters(pickup, far) > 50);
});
