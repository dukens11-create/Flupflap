export type TripStatus =
  | 'RIDE_ACCEPTED'
  | 'ARRIVED_AT_PICKUP'
  | 'TRIP_STARTED'
  | 'TRIP_ENDED'
  | 'TRIP_COMPLETED'
  | 'TRIP_CANCELLED'
  | 'NO_SHOW';

export type CancellationReason =
  | 'Passenger not arriving'
  | 'Wrong pickup location'
  | 'Vehicle issue'
  | 'Personal emergency'
  | 'Other';

export type WaitingColor = 'green' | 'orange' | 'red';

export type TripLocation = {
  lat: number;
  lng: number;
};

export type TripNotification =
  | 'ARRIVAL_NOTIFICATION'
  | 'TRIP_START_CONFIRMATION'
  | 'APPROACHING_DESTINATION_ALERT'
  | 'TRIP_END_NOTIFICATION'
  | 'NO_SHOW_NOTIFICATION'
  | 'CANCELLATION_NOTIFICATION'
  | 'RATING_REQUEST_NOTIFICATION';

export type TripLogEvent = {
  event: string;
  timestamp: string;
  details?: Record<string, unknown>;
};

export type WaitingTimer = {
  active: boolean;
  elapsedSeconds: number;
  remainingSeconds: number;
  color: WaitingColor;
  shouldBeep: boolean;
  label: string;
};

export type TripSummary = {
  pickupAddress: string;
  dropoffAddress: string;
  distanceMeters: number;
  durationSeconds: number;
  baseFareCents: number;
  tripFareCents: number;
  tipsCents: number;
  cancellationFeeCents: number;
  noShowFeeCents: number;
  totalEarningsCents: number;
  passengerRating?: number;
  driverNotes?: string;
  receiptPhotoUrl?: string;
};

export type TripUiState = {
  headerStatus: string;
  mapMode: 'to_pickup' | 'waiting_pickup' | 'to_destination' | 'summary';
  showArrivedAtPickupBanner: boolean;
  showPassengerNotArrivedIndicator: boolean;
  showPickupAddressConfirmation: boolean;
  showApproachingDestinationPrompt: boolean;
  availableButtons: Array<'startTrip' | 'endTrip' | 'cancelTrip' | 'noShow' | 'completeTrip'>;
  animateTransition: boolean;
};

export type TripConfig = {
  arrivalRadiusMeters: number;
  noShowTimeoutSeconds: number;
  beepAtSeconds: number;
  baseFareCents: number;
  centsPerKm: number;
  centsPerMinute: number;
  cancellationFeeCents: number;
  noShowFeeCents: number;
  surgeMultiplier: number;
};

export const DEFAULT_TRIP_CONFIG: TripConfig = {
  arrivalRadiusMeters: 50,
  noShowTimeoutSeconds: 10 * 60,
  beepAtSeconds: 5 * 60,
  baseFareCents: 300,
  centsPerKm: 120,
  centsPerMinute: 30,
  cancellationFeeCents: 500,
  noShowFeeCents: 700,
  surgeMultiplier: 1,
};

export type TripState = {
  status: TripStatus;
  pickupAddress: string;
  dropoffAddress: string;
  pickupLocation: TripLocation;
  dropoffLocation: TripLocation;
  currentLocation: TripLocation;
  speedMps: number;
  etaSeconds: number;
  passengerInVehicle: boolean;
  passengerCount: number;
  waitingTimer: WaitingTimer;
  distanceMeters: number;
  tripDurationSeconds: number;
  tipsCents: number;
  cancellationFeeCents: number;
  noShowFeeCents: number;
  totalEarningsCents: number;
  requestedActions: string[];
  notifications: TripNotification[];
  log: TripLogEvent[];
  lastError?: string;
  receiptPhotoUrl?: string;
  driverNotes?: string;
  passengerRating?: number;
  arrivedAtPickupAt?: string;
  tripStartedAt?: string;
  destinationArrivalDetectedAt?: string;
  tripEndedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  noShowAt?: string;
};

export type TripAction =
  | { type: 'GPS_UPDATE'; location: TripLocation; speedMps?: number; now?: Date }
  | { type: 'TICK_WAITING_TIMER'; seconds?: number }
  | { type: 'SET_PASSENGER_IN_VEHICLE'; inVehicle: boolean }
  | { type: 'START_TRIP'; passengerCount: number; receiptPhotoUrl?: string }
  | { type: 'END_TRIP'; tipsCents?: number; driverNotes?: string; passengerRating?: number }
  | { type: 'COMPLETE_TRIP'; passengerRating?: number; driverNotes?: string }
  | { type: 'MARK_NO_SHOW'; confirmed: boolean }
  | { type: 'CANCEL_TRIP'; reason: CancellationReason; notes?: string };

function formatTimerLabel(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function waitingColor(elapsedSeconds: number, noShowTimeoutSeconds: number): WaitingColor {
  const ratio = elapsedSeconds / Math.max(1, noShowTimeoutSeconds);
  if (ratio >= 0.8) return 'red';
  if (ratio >= 0.5) return 'orange';
  return 'green';
}

function withLog(state: TripState, event: string, details?: Record<string, unknown>, now = new Date()): TripState {
  return {
    ...state,
    log: [...state.log, { event, timestamp: now.toISOString(), details }],
  };
}

function withNotification(state: TripState, notification: TripNotification): TripState {
  return {
    ...state,
    notifications: [...state.notifications, notification],
  };
}

export function haversineDistanceMeters(a: TripLocation, b: TripLocation): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latDelta = toRad(b.lat - a.lat);
  const lngDelta = toRad(b.lng - a.lng);
  const latA = toRad(a.lat);
  const latB = toRad(b.lat);

  const c =
    Math.sin(latDelta / 2) ** 2
    + Math.cos(latA) * Math.cos(latB) * Math.sin(lngDelta / 2) ** 2;

  const angularDistance = 2 * Math.atan2(Math.sqrt(c), Math.sqrt(1 - c));
  return earthRadiusMeters * angularDistance;
}

export function isWithinRadiusMeters(location: TripLocation, target: TripLocation, radiusMeters: number): boolean {
  return haversineDistanceMeters(location, target) <= radiusMeters;
}

function computeEtaSeconds(distanceMeters: number, speedMps: number): number {
  if (speedMps <= 0) return 0;
  return Math.ceil(distanceMeters / speedMps);
}

function tripFareCents(state: TripState, config: TripConfig): number {
  const distanceKm = state.distanceMeters / 1_000;
  const durationMinutes = state.tripDurationSeconds / 60;
  const variableFare = Math.round((distanceKm * config.centsPerKm + durationMinutes * config.centsPerMinute) * config.surgeMultiplier);
  return config.baseFareCents + variableFare;
}

export function createTripState(input: {
  pickupAddress: string;
  dropoffAddress: string;
  pickupLocation: TripLocation;
  dropoffLocation: TripLocation;
  initialLocation?: TripLocation;
}): TripState {
  const now = new Date().toISOString();
  return {
    status: 'RIDE_ACCEPTED',
    pickupAddress: input.pickupAddress,
    dropoffAddress: input.dropoffAddress,
    pickupLocation: input.pickupLocation,
    dropoffLocation: input.dropoffLocation,
    currentLocation: input.initialLocation ?? input.pickupLocation,
    speedMps: 0,
    etaSeconds: 0,
    passengerInVehicle: false,
    passengerCount: 0,
    waitingTimer: {
      active: false,
      elapsedSeconds: 0,
      remainingSeconds: 0,
      color: 'green',
      shouldBeep: false,
      label: formatTimerLabel(0),
    },
    distanceMeters: 0,
    tripDurationSeconds: 0,
    tipsCents: 0,
    cancellationFeeCents: 0,
    noShowFeeCents: 0,
    totalEarningsCents: 0,
    requestedActions: [],
    notifications: [],
    log: [{ event: 'RIDE_ACCEPTED', timestamp: now }],
  };
}

function arrivedAtPickup(state: TripState, config: TripConfig, now = new Date()): TripState {
  if (state.status !== 'RIDE_ACCEPTED') return state;

  let next: TripState = {
    ...state,
    status: 'ARRIVED_AT_PICKUP',
    arrivedAtPickupAt: now.toISOString(),
    waitingTimer: {
      active: true,
      elapsedSeconds: 0,
      remainingSeconds: config.noShowTimeoutSeconds,
      color: 'green',
      shouldBeep: false,
      label: formatTimerLabel(config.noShowTimeoutSeconds),
    },
    requestedActions: ['PASSENGER_STILL_NOT_ARRIVED'],
  };

  next = withNotification(next, 'ARRIVAL_NOTIFICATION');
  next = withLog(next, 'ARRIVED_AT_PICKUP', {
    pickupAddress: state.pickupAddress,
    withinMeters: config.arrivalRadiusMeters,
  }, now);

  return next;
}

function applyGpsUpdate(state: TripState, action: Extract<TripAction, { type: 'GPS_UPDATE' }>, config: TripConfig): TripState {
  const now = action.now ?? new Date();
  const previousLocation = state.currentLocation;
  let next: TripState = {
    ...state,
    currentLocation: action.location,
    speedMps: action.speedMps ?? state.speedMps,
  };

  if (state.status === 'TRIP_STARTED') {
    next.distanceMeters += haversineDistanceMeters(previousLocation, action.location);
    next.tripDurationSeconds += 2;
    const remainingDistance = haversineDistanceMeters(action.location, state.dropoffLocation);
    next.etaSeconds = computeEtaSeconds(remainingDistance, next.speedMps || 1);

    if (!next.destinationArrivalDetectedAt && isWithinRadiusMeters(action.location, state.dropoffLocation, config.arrivalRadiusMeters)) {
      next.destinationArrivalDetectedAt = now.toISOString();
      next = withNotification(next, 'APPROACHING_DESTINATION_ALERT');
      next = withLog(next, 'ARRIVED_NEAR_DESTINATION', {
        distanceMeters: remainingDistance,
      }, now);
    }
  } else if (state.status === 'RIDE_ACCEPTED') {
    const distanceToPickup = haversineDistanceMeters(action.location, state.pickupLocation);
    next.etaSeconds = computeEtaSeconds(distanceToPickup, next.speedMps || 1);
    if (isWithinRadiusMeters(action.location, state.pickupLocation, config.arrivalRadiusMeters)) {
      next = arrivedAtPickup(next, config, now);
    }
  }

  return withLog(next, 'GPS_UPDATED', {
    lat: action.location.lat,
    lng: action.location.lng,
    speedMps: next.speedMps,
    etaSeconds: next.etaSeconds,
  }, now);
}

function applyWaitingTick(state: TripState, seconds: number, config: TripConfig, now = new Date()): TripState {
  if (state.status !== 'ARRIVED_AT_PICKUP' || !state.waitingTimer.active) {
    return state;
  }

  const elapsed = state.waitingTimer.elapsedSeconds + Math.max(1, seconds);
  const remaining = Math.max(0, config.noShowTimeoutSeconds - elapsed);
  const beepCrossedThreshold =
    state.waitingTimer.elapsedSeconds < config.beepAtSeconds && elapsed >= config.beepAtSeconds;

  let next: TripState = {
    ...state,
    waitingTimer: {
      active: true,
      elapsedSeconds: elapsed,
      remainingSeconds: remaining,
      color: waitingColor(elapsed, config.noShowTimeoutSeconds),
      shouldBeep: beepCrossedThreshold,
      label: formatTimerLabel(remaining),
    },
  };

  if (remaining === 0 && !next.requestedActions.includes('NO_SHOW_OPTION_AVAILABLE')) {
    next = {
      ...next,
      requestedActions: [...next.requestedActions, 'NO_SHOW_OPTION_AVAILABLE'],
    };
  }

  return withLog(next, 'WAITING_TIMER_TICK', {
    elapsedSeconds: elapsed,
    remainingSeconds: remaining,
  }, now);
}

function startTrip(
  state: TripState,
  action: Extract<TripAction, { type: 'START_TRIP' }>,
  now = new Date(),
): TripState {
  if (state.status !== 'ARRIVED_AT_PICKUP') {
    return {
      ...state,
      lastError: 'Cannot start trip before arriving at pickup.',
    };
  }

  if (!state.passengerInVehicle || action.passengerCount <= 0) {
    return {
      ...state,
      lastError: 'Passenger confirmation is required before starting trip.',
    };
  }

  let next: TripState = {
    ...state,
    status: 'TRIP_STARTED',
    waitingTimer: {
      ...state.waitingTimer,
      active: false,
      shouldBeep: false,
    },
    passengerCount: action.passengerCount,
    tripStartedAt: now.toISOString(),
    receiptPhotoUrl: action.receiptPhotoUrl,
    requestedActions: [],
  };

  next = withNotification(next, 'TRIP_START_CONFIRMATION');
  next = withLog(next, 'TRIP_STARTED', {
    passengerCount: action.passengerCount,
    receiptPhotoCaptured: Boolean(action.receiptPhotoUrl),
  }, now);

  return next;
}

function endTrip(
  state: TripState,
  action: Extract<TripAction, { type: 'END_TRIP' }>,
  config: TripConfig,
  now = new Date(),
): TripState {
  if (state.status !== 'TRIP_STARTED') {
    return {
      ...state,
      lastError: 'Cannot end trip before trip starts.',
    };
  }

  const tripFare = tripFareCents(state, config);
  const tipsCents = Math.max(0, action.tipsCents ?? 0);
  const totalEarningsCents = tripFare + tipsCents;

  let next: TripState = {
    ...state,
    status: 'TRIP_ENDED',
    tripEndedAt: now.toISOString(),
    tipsCents,
    totalEarningsCents,
    passengerRating: action.passengerRating ?? state.passengerRating,
    driverNotes: action.driverNotes ?? state.driverNotes,
  };

  next = withNotification(next, 'TRIP_END_NOTIFICATION');
  next = withNotification(next, 'RATING_REQUEST_NOTIFICATION');
  next = withLog(next, 'TRIP_ENDED', {
    distanceMeters: state.distanceMeters,
    durationSeconds: state.tripDurationSeconds,
    tripFareCents: tripFare,
    tipsCents,
  }, now);

  return next;
}

function completeTrip(state: TripState, action: Extract<TripAction, { type: 'COMPLETE_TRIP' }>, now = new Date()): TripState {
  if (state.status !== 'TRIP_ENDED') {
    return {
      ...state,
      lastError: 'Trip can only be completed after ending.',
    };
  }

  return withLog({
    ...state,
    status: 'TRIP_COMPLETED',
    completedAt: now.toISOString(),
    passengerRating: action.passengerRating ?? state.passengerRating,
    driverNotes: action.driverNotes ?? state.driverNotes,
  }, 'TRIP_COMPLETED', undefined, now);
}

function cancelTrip(
  state: TripState,
  action: Extract<TripAction, { type: 'CANCEL_TRIP' }>,
  config: TripConfig,
  now = new Date(),
): TripState {
  if (state.status !== 'RIDE_ACCEPTED' && state.status !== 'ARRIVED_AT_PICKUP') {
    return {
      ...state,
      lastError: 'Trip can only be cancelled before trip start.',
    };
  }

  let fee = 0;
  if (action.reason === 'Passenger not arriving' || action.reason === 'Wrong pickup location') {
    fee = config.cancellationFeeCents;
  }

  let next: TripState = {
    ...state,
    status: 'TRIP_CANCELLED',
    cancelledAt: now.toISOString(),
    cancellationFeeCents: fee,
    totalEarningsCents: fee,
    waitingTimer: {
      ...state.waitingTimer,
      active: false,
      shouldBeep: false,
    },
    driverNotes: action.notes ?? state.driverNotes,
  };

  next = withNotification(next, 'CANCELLATION_NOTIFICATION');
  next = withLog(next, 'TRIP_CANCELLED', {
    reason: action.reason,
    notes: action.notes,
    cancellationFeeCents: fee,
  }, now);

  return next;
}

function markNoShow(state: TripState, action: Extract<TripAction, { type: 'MARK_NO_SHOW' }>, config: TripConfig, now = new Date()): TripState {
  if (state.status !== 'ARRIVED_AT_PICKUP') {
    return {
      ...state,
      lastError: 'No-show can only be marked while waiting at pickup.',
    };
  }

  if (!action.confirmed) {
    return {
      ...state,
      lastError: 'No-show confirmation is required.',
    };
  }

  if (state.waitingTimer.elapsedSeconds < config.noShowTimeoutSeconds) {
    return {
      ...state,
      lastError: 'No-show cannot be marked before wait timeout.',
    };
  }

  let next: TripState = {
    ...state,
    status: 'NO_SHOW',
    noShowAt: now.toISOString(),
    noShowFeeCents: config.noShowFeeCents,
    totalEarningsCents: config.noShowFeeCents,
    waitingTimer: {
      ...state.waitingTimer,
      active: false,
      shouldBeep: false,
    },
  };

  next = withNotification(next, 'NO_SHOW_NOTIFICATION');
  next = withLog(next, 'RIDER_NO_SHOW', {
    waitedSeconds: state.waitingTimer.elapsedSeconds,
    noShowFeeCents: config.noShowFeeCents,
  }, now);

  return next;
}

export function reduceTripState(state: TripState, action: TripAction, config: Partial<TripConfig> = {}): TripState {
  const mergedConfig = {
    ...DEFAULT_TRIP_CONFIG,
    ...config,
  } satisfies TripConfig;

  try {
    switch (action.type) {
      case 'GPS_UPDATE':
        return applyGpsUpdate(state, action, mergedConfig);
      case 'TICK_WAITING_TIMER':
        return applyWaitingTick(state, action.seconds ?? 1, mergedConfig);
      case 'SET_PASSENGER_IN_VEHICLE':
        return withLog({
          ...state,
          passengerInVehicle: action.inVehicle,
        }, 'PASSENGER_IN_VEHICLE_UPDATED', { inVehicle: action.inVehicle });
      case 'START_TRIP':
        return startTrip(state, action);
      case 'END_TRIP':
        return endTrip(state, action, mergedConfig);
      case 'COMPLETE_TRIP':
        return completeTrip(state, action);
      case 'MARK_NO_SHOW':
        return markNoShow(state, action, mergedConfig);
      case 'CANCEL_TRIP':
        return cancelTrip(state, action, mergedConfig);
      default:
        return state;
    }
  } catch {
    return withLog({
      ...state,
      lastError: 'State transition failed. Please retry.',
    }, 'STATE_TRANSITION_FAILED', { action: action.type });
  }
}

export function getTripSummary(state: TripState, config: Partial<TripConfig> = {}): TripSummary {
  const mergedConfig = {
    ...DEFAULT_TRIP_CONFIG,
    ...config,
  } satisfies TripConfig;

  const tripFare = tripFareCents(state, mergedConfig);

  return {
    pickupAddress: state.pickupAddress,
    dropoffAddress: state.dropoffAddress,
    distanceMeters: Math.round(state.distanceMeters),
    durationSeconds: state.tripDurationSeconds,
    baseFareCents: mergedConfig.baseFareCents,
    tripFareCents: tripFare,
    tipsCents: state.tipsCents,
    cancellationFeeCents: state.cancellationFeeCents,
    noShowFeeCents: state.noShowFeeCents,
    totalEarningsCents: state.totalEarningsCents,
    passengerRating: state.passengerRating,
    driverNotes: state.driverNotes,
    receiptPhotoUrl: state.receiptPhotoUrl,
  };
}

export function getTripUiState(state: TripState): TripUiState {
  switch (state.status) {
    case 'RIDE_ACCEPTED':
      return {
        headerStatus: 'Ride Accepted',
        mapMode: 'to_pickup',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: false,
        availableButtons: ['cancelTrip'],
        animateTransition: true,
      };
    case 'ARRIVED_AT_PICKUP': {
      const canNoShow = state.waitingTimer.elapsedSeconds >= DEFAULT_TRIP_CONFIG.noShowTimeoutSeconds;
      return {
        headerStatus: 'Arrived at Pickup',
        mapMode: 'waiting_pickup',
        showArrivedAtPickupBanner: true,
        showPassengerNotArrivedIndicator: !state.passengerInVehicle,
        showPickupAddressConfirmation: true,
        showApproachingDestinationPrompt: false,
        availableButtons: [
          ...(state.passengerInVehicle ? (['startTrip'] as const) : []),
          ...(canNoShow ? (['noShow'] as const) : []),
          'cancelTrip',
        ],
        animateTransition: true,
      };
    }
    case 'TRIP_STARTED':
      return {
        headerStatus: 'Trip Started',
        mapMode: 'to_destination',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: Boolean(state.destinationArrivalDetectedAt),
        availableButtons: ['endTrip'],
        animateTransition: true,
      };
    case 'TRIP_ENDED':
      return {
        headerStatus: 'Trip Ended',
        mapMode: 'summary',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: false,
        availableButtons: ['completeTrip'],
        animateTransition: true,
      };
    case 'TRIP_COMPLETED':
      return {
        headerStatus: 'Trip Completed',
        mapMode: 'summary',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: false,
        availableButtons: [],
        animateTransition: false,
      };
    case 'TRIP_CANCELLED':
      return {
        headerStatus: 'Trip Cancelled',
        mapMode: 'summary',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: false,
        availableButtons: [],
        animateTransition: false,
      };
    case 'NO_SHOW':
      return {
        headerStatus: 'No-Show',
        mapMode: 'summary',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: true,
        showPickupAddressConfirmation: true,
        showApproachingDestinationPrompt: false,
        availableButtons: [],
        animateTransition: false,
      };
    default:
      return {
        headerStatus: 'Unknown',
        mapMode: 'summary',
        showArrivedAtPickupBanner: false,
        showPassengerNotArrivedIndicator: false,
        showPickupAddressConfirmation: false,
        showApproachingDestinationPrompt: false,
        availableButtons: [],
        animateTransition: false,
      };
  }
}
