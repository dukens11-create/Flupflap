export type DriverAvailabilityStatus = 'online' | 'offline';
export type RideAction = 'accept' | 'reject';

export type DriverLocation = {
  lat: number;
  lng: number;
  label: string;
};

export type RideRequest = {
  id: string;
  passengerName: string;
  passengerAvatar: string;
  passengerPhone: string;
  pickupAddress: string;
  destinationAddress: string;
  pickupDistanceMiles: number;
  estimatedEarningsCents: number;
  requestedAt: string;
  pickup: DriverLocation;
  destination: DriverLocation;
  status: 'pending' | 'accepted' | 'rejected';
};

export type TripHistoryItem = {
  id: string;
  date: string;
  passengerName: string;
  pickupAddress: string;
  destinationAddress: string;
  earningsCents: number;
  rating: number;
};

export type DriverNotification = {
  id: string;
  title: string;
  message: string;
  type: 'ride_request' | 'status' | 'cancellation' | 'message';
  createdAt: string;
};

export type DriverDashboardPayload = {
  availabilityStatus: DriverAvailabilityStatus;
  availabilityLabel: string;
  lastSyncedAt: string;
  driverLocation: DriverLocation;
  rideRequests: RideRequest[];
  tripHistory: TripHistoryItem[];
  notifications: DriverNotification[];
  wallet: {
    totalEarningsCents: number;
    dailyEarningsCents: number;
    weeklyEarningsCents: number;
  };
  rating: {
    currentRating: number;
    totalRides: number;
    acceptanceRate: number;
  };
};

type DriverDashboardState = {
  availabilityStatus: DriverAvailabilityStatus;
  driverLocation: DriverLocation;
  rideRequests: RideRequest[];
  tripHistory: TripHistoryItem[];
  notifications: DriverNotification[];
};

const DAY_MS = 24 * 60 * 60 * 1000;
const BASE_TIME = Date.parse('2026-05-31T18:00:00.000Z');

const initialState: DriverDashboardState = {
  availabilityStatus: 'offline',
  driverLocation: {
    lat: 40.73061,
    lng: -73.935242,
    label: 'Brooklyn, NY',
  },
  rideRequests: [
    {
      id: 'ride_901',
      passengerName: 'Ava Thompson',
      passengerAvatar: 'https://i.pravatar.cc/120?img=12',
      passengerPhone: '+13475550121',
      pickupAddress: '145 Flatbush Ave, Brooklyn, NY',
      destinationAddress: '11 Wall St, New York, NY',
      pickupDistanceMiles: 1.2,
      estimatedEarningsCents: 1850,
      requestedAt: new Date(BASE_TIME - 4 * 60 * 1000).toISOString(),
      pickup: { lat: 40.6892, lng: -73.9442, label: 'Flatbush Ave' },
      destination: { lat: 40.7074, lng: -74.0113, label: 'Wall St' },
      status: 'pending',
    },
    {
      id: 'ride_902',
      passengerName: 'Noah Williams',
      passengerAvatar: 'https://i.pravatar.cc/120?img=33',
      passengerPhone: '+13475550444',
      pickupAddress: '77 Bedford Ave, Brooklyn, NY',
      destinationAddress: '200 W 43rd St, New York, NY',
      pickupDistanceMiles: 2.4,
      estimatedEarningsCents: 2330,
      requestedAt: new Date(BASE_TIME - 9 * 60 * 1000).toISOString(),
      pickup: { lat: 40.7177, lng: -73.9562, label: 'Bedford Ave' },
      destination: { lat: 40.757, lng: -73.9865, label: 'Times Square' },
      status: 'pending',
    },
    {
      id: 'ride_903',
      passengerName: 'Sophia Johnson',
      passengerAvatar: 'https://i.pravatar.cc/120?img=45',
      passengerPhone: '+13475550789',
      pickupAddress: '1 Montague St, Brooklyn, NY',
      destinationAddress: '4 Pennsylvania Plaza, New York, NY',
      pickupDistanceMiles: 0.8,
      estimatedEarningsCents: 1420,
      requestedAt: new Date(BASE_TIME - 11 * 60 * 1000).toISOString(),
      pickup: { lat: 40.6937, lng: -73.9896, label: 'Montague St' },
      destination: { lat: 40.7505, lng: -73.9934, label: 'Penn Station' },
      status: 'pending',
    },
  ],
  tripHistory: [
    {
      id: 'trip_510',
      date: new Date(BASE_TIME).toISOString(),
      passengerName: 'Daniel Brooks',
      pickupAddress: '53 Atlantic Ave, Brooklyn, NY',
      destinationAddress: '1 W 72nd St, New York, NY',
      earningsCents: 2140,
      rating: 5,
    },
    {
      id: 'trip_509',
      date: new Date(BASE_TIME - DAY_MS).toISOString(),
      passengerName: 'Chloe Carter',
      pickupAddress: '200 Kent Ave, Brooklyn, NY',
      destinationAddress: '80 W Broadway, New York, NY',
      earningsCents: 1785,
      rating: 4.8,
    },
    {
      id: 'trip_508',
      date: new Date(BASE_TIME - (2 * DAY_MS)).toISOString(),
      passengerName: 'Mason Lee',
      pickupAddress: '56 Court St, Brooklyn, NY',
      destinationAddress: '5th Ave & E 90th St, New York, NY',
      earningsCents: 2510,
      rating: 5,
    },
    {
      id: 'trip_507',
      date: new Date(BASE_TIME - (6 * DAY_MS)).toISOString(),
      passengerName: 'Aria Davis',
      pickupAddress: '75 Smith St, Brooklyn, NY',
      destinationAddress: '10 Columbus Cir, New York, NY',
      earningsCents: 1980,
      rating: 4.9,
    },
  ],
  notifications: [
    {
      id: 'notif_1',
      title: 'New ride nearby',
      message: 'Ava Thompson requested a pickup 1.2 mi away.',
      type: 'ride_request',
      createdAt: new Date(BASE_TIME - 2 * 60 * 1000).toISOString(),
    },
    {
      id: 'notif_2',
      title: 'Passenger message',
      message: 'Noah Williams: “I am at the front entrance.”',
      type: 'message',
      createdAt: new Date(BASE_TIME - 7 * 60 * 1000).toISOString(),
    },
  ],
};

const DRIVER_DASHBOARD_STATE_KEY = '__FLUPFLAP_DRIVER_DASHBOARD_STATE__';

function getState(): DriverDashboardState {
  const target = globalThis as typeof globalThis & {
    [DRIVER_DASHBOARD_STATE_KEY]?: DriverDashboardState;
  };

  if (!target[DRIVER_DASHBOARD_STATE_KEY]) {
    target[DRIVER_DASHBOARD_STATE_KEY] = structuredClone(initialState);
  }

  return target[DRIVER_DASHBOARD_STATE_KEY] as DriverDashboardState;
}

export function calculateEarnings(tripHistory: TripHistoryItem[], now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const weekWindowStart = new Date(now.getTime() - (7 * DAY_MS));

  let totalEarningsCents = 0;
  let dailyEarningsCents = 0;
  let weeklyEarningsCents = 0;

  for (const trip of tripHistory) {
    totalEarningsCents += trip.earningsCents;
    const completedAt = new Date(trip.date);
    if (completedAt >= startOfDay) {
      dailyEarningsCents += trip.earningsCents;
    }
    if (completedAt >= weekWindowStart) {
      weeklyEarningsCents += trip.earningsCents;
    }
  }

  return {
    totalEarningsCents,
    dailyEarningsCents,
    weeklyEarningsCents,
  };
}

function getAcceptanceRate(rideRequests: RideRequest[]) {
  const accepted = rideRequests.filter((ride) => ride.status === 'accepted').length;
  const handled = rideRequests.filter((ride) => ride.status === 'accepted' || ride.status === 'rejected').length;
  if (!handled) return 100;
  return Math.round((accepted / handled) * 100);
}

function asAvailabilityLabel(status: DriverAvailabilityStatus): string {
  return status === 'online' ? 'Online' : 'Offline';
}

function prependNotification(notification: DriverNotification) {
  const state = getState();
  state.notifications.unshift(notification);
  state.notifications = state.notifications.slice(0, 20);
}

export function getDriverDashboardPayload(): DriverDashboardPayload {
  const state = getState();
  const wallet = calculateEarnings(state.tripHistory);
  const acceptedRides = state.rideRequests.filter((ride) => ride.status === 'accepted').length;

  return {
    availabilityStatus: state.availabilityStatus,
    availabilityLabel: asAvailabilityLabel(state.availabilityStatus),
    lastSyncedAt: new Date().toISOString(),
    driverLocation: state.driverLocation,
    rideRequests: state.rideRequests.filter((ride) => ride.status === 'pending'),
    tripHistory: state.tripHistory,
    notifications: state.notifications,
    wallet,
    rating: {
      currentRating: 4.9,
      totalRides: state.tripHistory.length + acceptedRides,
      acceptanceRate: getAcceptanceRate(state.rideRequests),
    },
  };
}

export function updateDriverAvailabilityStatus(status: DriverAvailabilityStatus): DriverDashboardPayload {
  const state = getState();
  if (state.availabilityStatus !== status) {
    state.availabilityStatus = status;
    prependNotification({
      id: `notif_${Date.now()}`,
      title: `Status changed to ${asAvailabilityLabel(status)}`,
      message: status === 'online' ? 'You can now receive new ride requests.' : 'You will no longer receive new ride requests.',
      type: 'status',
      createdAt: new Date().toISOString(),
    });
  }

  return getDriverDashboardPayload();
}

export function applyRideAction(rideId: string, action: RideAction): DriverDashboardPayload {
  const state = getState();
  const ride = state.rideRequests.find((request) => request.id === rideId);

  if (!ride) {
    throw new Error('Ride request not found.');
  }

  if (ride.status !== 'pending') {
    throw new Error('Ride request was already handled.');
  }

  ride.status = action === 'accept' ? 'accepted' : 'rejected';

  prependNotification({
    id: `notif_${Date.now()}`,
    title: action === 'accept' ? 'Ride accepted' : 'Ride rejected',
    message: `${ride.passengerName}'s request was ${action === 'accept' ? 'accepted' : 'rejected'}.`,
    type: action === 'accept' ? 'ride_request' : 'cancellation',
    createdAt: new Date().toISOString(),
  });

  return getDriverDashboardPayload();
}

export function resetDriverDashboardStateForTests() {
  const target = globalThis as typeof globalThis & {
    [DRIVER_DASHBOARD_STATE_KEY]?: DriverDashboardState;
  };
  target[DRIVER_DASHBOARD_STATE_KEY] = structuredClone(initialState);
}
