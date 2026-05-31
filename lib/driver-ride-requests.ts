export const RIDE_REQUEST_TIMEOUT_MS = 30_000;

export type DriverAvailabilityStatus = 'ONLINE' | 'OFFLINE' | 'ON_TRIP';
export type RideRequestResponseAction = 'accept' | 'reject' | 'timeout';
export type RideRequestUrgency = 'standard' | 'urgent';

export type DriverRideRequest = {
  id: string;
  passenger: {
    name: string;
    profileImage: string;
    rating: number;
    previousRides: number;
    phone: string;
  };
  pickup: {
    title: string;
    address: string;
  };
  destination: {
    title: string;
    address: string;
  };
  distanceMiles: number;
  estimatedFareCents: number;
  estimatedPickupMinutes: number;
  urgency: RideRequestUrgency;
  releaseAt: string;
  expiresAt: string;
  notes: string;
};

export type RideRequestResponseRecord = {
  id: string;
  requestId: string;
  action: RideRequestResponseAction;
  respondedAt: string;
  passengerName: string;
};

export type DriverRideAnalytics = {
  totalResponses: number;
  accepted: number;
  rejected: number;
  timedOut: number;
  acceptanceRate: number;
  rejectionRate: number;
  timeoutRate: number;
};

export type DriverRideState = {
  driverStatus: DriverAvailabilityStatus;
  doNotDisturb: boolean;
  requests: DriverRideRequest[];
  responses: RideRequestResponseRecord[];
  sequence: number;
};

export type DriverRideSnapshot = {
  driverStatus: DriverAvailabilityStatus;
  doNotDisturb: boolean;
  activeRequest: DriverRideRequest | null;
  queuedRequests: DriverRideRequest[];
  recentResponses: RideRequestResponseRecord[];
  analytics: DriverRideAnalytics;
  queueCount: number;
  badgeCount: number;
  generatedAt: string;
};

type RideRequestSeed = Omit<DriverRideRequest, 'id' | 'releaseAt' | 'expiresAt'> & {
  releaseOffsetMs: number;
};

const MOCK_RIDE_REQUEST_SEEDS: RideRequestSeed[] = [
  {
    passenger: {
      name: 'Maya Thompson',
      profileImage: 'https://i.pravatar.cc/160?img=32',
      rating: 4.9,
      previousRides: 184,
      phone: '+14155550101',
    },
    pickup: {
      title: 'Union Square',
      address: '333 Post St, San Francisco, CA 94108',
    },
    destination: {
      title: 'Mission Bay',
      address: '1500 Owens St, San Francisco, CA 94158',
    },
    distanceMiles: 1.4,
    estimatedFareCents: 1875,
    estimatedPickupMinutes: 4,
    urgency: 'urgent',
    releaseOffsetMs: 0,
    notes: 'Passenger prefers curbside pickup near the main entrance.',
  },
  {
    passenger: {
      name: 'Jordan Lee',
      profileImage: 'https://i.pravatar.cc/160?img=14',
      rating: 4.7,
      previousRides: 64,
      phone: '+14155550102',
    },
    pickup: {
      title: 'Ferry Building',
      address: '1 Ferry Building, San Francisco, CA 94111',
    },
    destination: {
      title: 'Oracle Park',
      address: '24 Willie Mays Plaza, San Francisco, CA 94107',
    },
    distanceMiles: 2.1,
    estimatedFareCents: 2240,
    estimatedPickupMinutes: 6,
    urgency: 'standard',
    releaseOffsetMs: 12_000,
    notes: 'Rider has one carry-on bag.',
  },
  {
    passenger: {
      name: 'Ariana Patel',
      profileImage: 'https://i.pravatar.cc/160?img=47',
      rating: 5,
      previousRides: 312,
      phone: '+14155550103',
    },
    pickup: {
      title: 'Salesforce Tower',
      address: '415 Mission St, San Francisco, CA 94105',
    },
    destination: {
      title: 'SFO Terminal 3',
      address: '780 S Airport Blvd, San Francisco, CA 94128',
    },
    distanceMiles: 3.8,
    estimatedFareCents: 3650,
    estimatedPickupMinutes: 8,
    urgency: 'urgent',
    releaseOffsetMs: 22_000,
    notes: 'Airport drop-off with priority lane requested.',
  },
];

function roundRate(value: number): number {
  return Number(value.toFixed(1));
}

function createResponseRecord(
  request: DriverRideRequest,
  action: RideRequestResponseAction,
  now: number,
  suffix = 0,
): RideRequestResponseRecord {
  return {
    id: `${request.id}:${action}:${now}:${suffix}`,
    requestId: request.id,
    action,
    respondedAt: new Date(now).toISOString(),
    passengerName: request.passenger.name,
  };
}

function hasResponse(state: DriverRideState, requestId: string): boolean {
  return state.responses.some((response) => response.requestId === requestId);
}

function createRequestFromSeed(seed: RideRequestSeed, index: number, baseTime: number): DriverRideRequest {
  const releaseAt = baseTime + seed.releaseOffsetMs;
  return {
    id: `ride-request-${index + 1}`,
    passenger: seed.passenger,
    pickup: seed.pickup,
    destination: seed.destination,
    distanceMiles: seed.distanceMiles,
    estimatedFareCents: seed.estimatedFareCents,
    estimatedPickupMinutes: seed.estimatedPickupMinutes,
    urgency: seed.urgency,
    releaseAt: new Date(releaseAt).toISOString(),
    expiresAt: new Date(releaseAt + RIDE_REQUEST_TIMEOUT_MS).toISOString(),
    notes: seed.notes,
  };
}

export function createMockRideRequests(baseTime = Date.now()): DriverRideRequest[] {
  return MOCK_RIDE_REQUEST_SEEDS.map((seed, index) => createRequestFromSeed(seed, index, baseTime));
}

export function initializeDriverRideState(baseTime = Date.now()): DriverRideState {
  const requests = createMockRideRequests(baseTime);
  return {
    driverStatus: 'ONLINE',
    doNotDisturb: false,
    requests,
    responses: [],
    sequence: requests.length,
  };
}

export function summarizeRideAnalytics(responses: RideRequestResponseRecord[]): DriverRideAnalytics {
  const totalResponses = responses.length;
  const accepted = responses.filter((response) => response.action === 'accept').length;
  const rejected = responses.filter((response) => response.action === 'reject').length;
  const timedOut = responses.filter((response) => response.action === 'timeout').length;

  if (totalResponses === 0) {
    return {
      totalResponses,
      accepted,
      rejected,
      timedOut,
      acceptanceRate: 0,
      rejectionRate: 0,
      timeoutRate: 0,
    };
  }

  return {
    totalResponses,
    accepted,
    rejected,
    timedOut,
    acceptanceRate: roundRate((accepted / totalResponses) * 100),
    rejectionRate: roundRate((rejected / totalResponses) * 100),
    timeoutRate: roundRate((timedOut / totalResponses) * 100),
  };
}

function getReleasedRequests(state: DriverRideState, now: number): DriverRideRequest[] {
  return state.requests
    .filter((request) => !hasResponse(state, request.id))
    .filter((request) => new Date(request.releaseAt).getTime() <= now)
    .sort((left, right) => new Date(left.releaseAt).getTime() - new Date(right.releaseAt).getTime());
}

export function applyRideRequestTimeouts(state: DriverRideState, now = Date.now()): DriverRideState {
  let nextState = state;

  for (const request of state.requests) {
    if (hasResponse(nextState, request.id)) continue;

    const releaseAt = new Date(request.releaseAt).getTime();
    const expiresAt = new Date(request.expiresAt).getTime();
    if (releaseAt <= now && expiresAt <= now) {
      nextState = {
        ...nextState,
        responses: [createResponseRecord(request, 'timeout', now, nextState.responses.length), ...nextState.responses],
      };
    }
  }

  return nextState;
}

export function updateDriverAvailability(
  state: DriverRideState,
  status: DriverAvailabilityStatus,
): DriverRideState {
  return {
    ...state,
    driverStatus: status,
  };
}

export function updateDoNotDisturb(state: DriverRideState, enabled: boolean): DriverRideState {
  return {
    ...state,
    doNotDisturb: enabled,
  };
}

export function enqueueSimulatedRideRequest(state: DriverRideState, now = Date.now()): DriverRideState {
  const seed = MOCK_RIDE_REQUEST_SEEDS[state.sequence % MOCK_RIDE_REQUEST_SEEDS.length];
  const sequence = state.sequence + 1;
  const request: DriverRideRequest = {
    ...seed,
    id: `ride-request-sim-${sequence}`,
    releaseAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RIDE_REQUEST_TIMEOUT_MS).toISOString(),
  };

  return {
    ...state,
    sequence,
    requests: [...state.requests, request],
  };
}

export function respondToRideRequest(
  state: DriverRideState,
  requestId: string,
  action: RideRequestResponseAction,
  now = Date.now(),
): DriverRideState {
  let nextState = applyRideRequestTimeouts(state, now);
  if (hasResponse(nextState, requestId)) return nextState;

  const request = nextState.requests.find((candidate) => candidate.id === requestId);
  if (!request) return nextState;

  const responses: RideRequestResponseRecord[] = [
    createResponseRecord(request, action, now),
    ...nextState.responses,
  ];

  nextState = {
    ...nextState,
    responses,
  };

  if (action === 'accept') {
    const releasedRequests = getReleasedRequests(nextState, now).filter((candidate) => candidate.id !== requestId);
    const autoRejected = releasedRequests.map((candidate, index) => createResponseRecord(candidate, 'reject', now, index + 1));

    nextState = {
      ...nextState,
      driverStatus: 'ON_TRIP',
      responses: [...autoRejected, ...nextState.responses],
    };
  }

  return nextState;
}

export function buildDriverRideSnapshot(
  state: DriverRideState,
  now = Date.now(),
): { state: DriverRideState; snapshot: DriverRideSnapshot } {
  const nextState = applyRideRequestTimeouts(state, now);
  const canReceiveRequests = nextState.driverStatus === 'ONLINE';
  const outstanding = canReceiveRequests ? getReleasedRequests(nextState, now) : [];

  return {
    state: nextState,
    snapshot: {
      driverStatus: nextState.driverStatus,
      doNotDisturb: nextState.doNotDisturb,
      activeRequest: outstanding[0] ?? null,
      queuedRequests: outstanding.slice(1),
      recentResponses: nextState.responses.slice(0, 6),
      analytics: summarizeRideAnalytics(nextState.responses),
      queueCount: outstanding.length,
      badgeCount: outstanding.length,
      generatedAt: new Date(now).toISOString(),
    },
  };
}
