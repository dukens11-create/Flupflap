export type DriverAvailabilityStatus = 'offline' | 'online' | 'busy' | 'on_trip';

export type RideStatus =
  | 'requested'
  | 'accepted'
  | 'arrived'
  | 'started'
  | 'ended'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type DriverLocationPoint = {
  latitude: number;
  longitude: number;
  timestamp: string;
};

export type DriverRecord = {
  driver_id: string;
  name: string;
  phone: string;
  email: string;
  rating: number;
  status: DriverAvailabilityStatus;
  vehicle_info: Record<string, string>;
  wallet_balance: number;
  pending_balance: number;
  last_status_changed_at: string;
  active_hours_seconds: number;
  last_location: DriverLocationPoint | null;
};

export type RideRecord = {
  ride_id: string;
  driver_id: string;
  passenger_id: string;
  passenger_name: string;
  passenger_phone: string;
  pickup: DriverLocationPoint & { address: string };
  dropoff: DriverLocationPoint & { address: string };
  status: RideStatus;
  earnings: number;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

export type LocationRecord = DriverLocationPoint & {
  location_id: string;
  driver_id: string;
  accuracy: number;
};

export type EarningType = 'base' | 'tip' | 'bonus' | 'surge' | 'adjustment';

export type EarningRecord = {
  earnings_id: string;
  driver_id: string;
  amount: number;
  trip_id: string;
  date: string;
  type: EarningType;
};

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed';

export type PaymentRecord = {
  payment_id: string;
  driver_id: string;
  amount: number;
  status: PaymentStatus;
  method: string;
  date: string;
};

export type ChatMessageRecord = {
  message_id: string;
  driver_id: string;
  trip_id: string;
  sender: 'driver' | 'passenger' | 'system';
  body: string;
  created_at: string;
  read_at: string | null;
  deleted_at: string | null;
  voice_note_url: string | null;
};

export type DriverDashboardCache = {
  driver: DriverRecord | null;
  rides: RideRecord[];
  locations: LocationRecord[];
  earnings: EarningRecord[];
  payments: PaymentRecord[];
  chatMessages: ChatMessageRecord[];
};

export type QueuedDriverMutation = {
  path: string;
  mode: 'set' | 'update' | 'remove';
  payload: Record<string, unknown>;
  createdAt: string;
};

export type TripEarningBreakdown = {
  base: number;
  distance: number;
  time: number;
  tip: number;
  bonus: number;
  surge: number;
  total: number;
};

const DRIVER_CACHE_PREFIX = 'driver-dashboard-cache:';
const DRIVER_QUEUE_PREFIX = 'driver-dashboard-queue:';
const MAX_TEXT_LENGTH = 160;

function sanitizeText(value: unknown, fallback = '', maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, maxLength);
}

function sanitizeIsoString(value: unknown) {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }
  return new Date().toISOString();
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function normalizePoint(value: unknown) {
  const point = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    latitude: clamp(toFiniteNumber(point.latitude, 0), -90, 90),
    longitude: clamp(toFiniteNumber(point.longitude, 0), -180, 180),
    timestamp: sanitizeIsoString(point.timestamp),
  };
}

function normalizeAddressPoint(value: unknown) {
  const point = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    ...normalizePoint(point),
    address: sanitizeText(point.address, 'Address unavailable', 220),
  };
}

function normalizeCollection<T>(
  value: unknown,
  normalizer: (recordId: string, item: unknown) => T,
  sortValue: (item: T) => string,
) {
  if (!value || typeof value !== 'object') {
    return [] as T[];
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([recordId, item]) => normalizer(recordId, item))
    .sort((left, right) => sortValue(right).localeCompare(sortValue(left)));
}

export function normalizeDriverRecord(value: unknown, driverId: string, fallbackEmail = ''): DriverRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const vehicleInfoValue = record.vehicle_info && typeof record.vehicle_info === 'object'
    ? record.vehicle_info as Record<string, unknown>
    : {};

  const status = sanitizeText(record.status, 'offline') as DriverAvailabilityStatus;
  const safeStatus: DriverAvailabilityStatus = ['offline', 'online', 'busy', 'on_trip'].includes(status)
    ? status
    : 'offline';

  return {
    driver_id: sanitizeText(record.driver_id, driverId),
    name: sanitizeText(record.name, 'Driver', 80),
    phone: sanitizeText(record.phone, '', 40),
    email: sanitizeText(record.email, fallbackEmail, 120),
    rating: clamp(toFiniteNumber(record.rating, 5), 0, 5),
    status: safeStatus,
    vehicle_info: Object.fromEntries(
      Object.entries(vehicleInfoValue)
        .map(([key, entry]) => [sanitizeText(key, ''), sanitizeText(entry, '', 80)])
        .filter(([key, entry]) => key && entry),
    ),
    wallet_balance: toFiniteNumber(record.wallet_balance, 0),
    pending_balance: toFiniteNumber(record.pending_balance, 0),
    last_status_changed_at: sanitizeIsoString(record.last_status_changed_at),
    active_hours_seconds: Math.max(0, toFiniteNumber(record.active_hours_seconds, 0)),
    last_location: record.last_location ? normalizePoint(record.last_location) : null,
  };
}

export function normalizeRideRecord(rideId: string, value: unknown, driverId = ''): RideRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = sanitizeText(record.status, 'requested') as RideStatus;
  const safeStatus: RideStatus = [
    'requested',
    'accepted',
    'arrived',
    'started',
    'ended',
    'completed',
    'cancelled',
    'no_show',
  ].includes(status)
    ? status
    : 'requested';

  return {
    ride_id: sanitizeText(record.ride_id, rideId),
    driver_id: sanitizeText(record.driver_id, driverId),
    passenger_id: sanitizeText(record.passenger_id, ''),
    passenger_name: sanitizeText(record.passenger_name, 'Passenger', 80),
    passenger_phone: sanitizeText(record.passenger_phone, '', 40),
    pickup: normalizeAddressPoint(record.pickup),
    dropoff: normalizeAddressPoint(record.dropoff),
    status: safeStatus,
    earnings: toFiniteNumber(record.earnings, 0),
    created_at: sanitizeIsoString(record.created_at),
    updated_at: sanitizeIsoString(record.updated_at ?? record.created_at),
    cancelled_at: record.cancelled_at ? sanitizeIsoString(record.cancelled_at) : null,
  };
}

export function normalizeLocationRecord(locationId: string, value: unknown, driverId = ''): LocationRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    location_id: sanitizeText(record.location_id, locationId),
    driver_id: sanitizeText(record.driver_id, driverId),
    ...normalizePoint(record),
    accuracy: Math.max(0, toFiniteNumber(record.accuracy, 0)),
  };
}

export function normalizeEarningRecord(earningId: string, value: unknown, driverId = ''): EarningRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const type = sanitizeText(record.type, 'base') as EarningType;
  const safeType: EarningType = ['base', 'tip', 'bonus', 'surge', 'adjustment'].includes(type)
    ? type
    : 'base';

  return {
    earnings_id: sanitizeText(record.earnings_id, earningId),
    driver_id: sanitizeText(record.driver_id, driverId),
    amount: toFiniteNumber(record.amount, 0),
    trip_id: sanitizeText(record.trip_id, ''),
    date: sanitizeIsoString(record.date),
    type: safeType,
  };
}

export function normalizePaymentRecord(paymentId: string, value: unknown, driverId = ''): PaymentRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const status = sanitizeText(record.status, 'pending') as PaymentStatus;
  const safeStatus: PaymentStatus = ['pending', 'processing', 'completed', 'failed'].includes(status)
    ? status
    : 'pending';

  return {
    payment_id: sanitizeText(record.payment_id, paymentId),
    driver_id: sanitizeText(record.driver_id, driverId),
    amount: toFiniteNumber(record.amount, 0),
    status: safeStatus,
    method: sanitizeText(record.method, 'wallet', 80),
    date: sanitizeIsoString(record.date),
  };
}

export function normalizeChatMessageRecord(messageId: string, value: unknown, driverId = ''): ChatMessageRecord {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const sender = sanitizeText(record.sender, 'system') as ChatMessageRecord['sender'];
  const safeSender: ChatMessageRecord['sender'] = ['driver', 'passenger', 'system'].includes(sender)
    ? sender
    : 'system';

  return {
    message_id: sanitizeText(record.message_id, messageId),
    driver_id: sanitizeText(record.driver_id, driverId),
    trip_id: sanitizeText(record.trip_id, ''),
    sender: safeSender,
    body: sanitizeText(record.body, '', 500),
    created_at: sanitizeIsoString(record.created_at),
    read_at: record.read_at ? sanitizeIsoString(record.read_at) : null,
    deleted_at: record.deleted_at ? sanitizeIsoString(record.deleted_at) : null,
    voice_note_url: record.voice_note_url ? sanitizeText(record.voice_note_url, '', 2000) : null,
  };
}

export function normalizeRideCollection(value: unknown, driverId: string) {
  return normalizeCollection(value, (recordId, item) => normalizeRideRecord(recordId, item, driverId), (item) => item.created_at);
}

export function normalizeLocationCollection(value: unknown, driverId: string) {
  return normalizeCollection(value, (recordId, item) => normalizeLocationRecord(recordId, item, driverId), (item) => item.timestamp);
}

export function normalizeEarningCollection(value: unknown, driverId: string) {
  return normalizeCollection(value, (recordId, item) => normalizeEarningRecord(recordId, item, driverId), (item) => item.date);
}

export function normalizePaymentCollection(value: unknown, driverId: string) {
  return normalizeCollection(value, (recordId, item) => normalizePaymentRecord(recordId, item, driverId), (item) => item.date);
}

export function normalizeChatCollection(value: unknown, driverId: string) {
  return normalizeCollection(value, (recordId, item) => normalizeChatMessageRecord(recordId, item, driverId), (item) => item.created_at);
}

export function trimLocationHistory(locations: LocationRecord[], limit = 100) {
  if (limit <= 0) return [];
  return [...locations]
    .sort((left, right) => left.timestamp.localeCompare(right.timestamp))
    .slice(-limit);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function calculateDistanceKm(start: Pick<DriverLocationPoint, 'latitude' | 'longitude'>, end: Pick<DriverLocationPoint, 'latitude' | 'longitude'>) {
  const earthRadiusKm = 6371;
  const deltaLatitude = toRadians(end.latitude - start.latitude);
  const deltaLongitude = toRadians(end.longitude - start.longitude);
  const latitude1 = toRadians(start.latitude);
  const latitude2 = toRadians(end.latitude);
  const haversine = Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function calculateTrackedDistanceKm(locations: LocationRecord[]) {
  if (locations.length < 2) return 0;
  const ordered = [...locations].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  let total = 0;
  for (let index = 1; index < ordered.length; index += 1) {
    total += calculateDistanceKm(ordered[index - 1], ordered[index]);
  }
  return total;
}

export function calculateAverageSpeedKph(locations: LocationRecord[]) {
  if (locations.length < 2) return 0;
  const ordered = [...locations].sort((left, right) => left.timestamp.localeCompare(right.timestamp));
  const startedAt = new Date(ordered[0].timestamp).getTime();
  const finishedAt = new Date(ordered[ordered.length - 1].timestamp).getTime();
  const elapsedHours = (finishedAt - startedAt) / (1000 * 60 * 60);
  if (elapsedHours <= 0) return 0;
  return calculateTrackedDistanceKm(ordered) / elapsedHours;
}

export function calculateEtaMinutes(distanceKm: number, averageSpeedKph = 28) {
  if (distanceKm <= 0 || averageSpeedKph <= 0) return 0;
  return Math.round((distanceKm / averageSpeedKph) * 60);
}

export function calculateTripEarnings(input: {
  distanceKm: number;
  durationMinutes: number;
  tip?: number;
  bonus?: number;
  surgeMultiplier?: number;
}) {
  const base = 4;
  const distance = Math.max(0, input.distanceKm) * 1.35;
  const time = Math.max(0, input.durationMinutes) * 0.42;
  const tip = Math.max(0, input.tip ?? 0);
  const bonus = input.bonus ?? 0;
  const surgeMultiplier = Math.max(1, input.surgeMultiplier ?? 1);
  const surgedFare = (base + distance + time) * surgeMultiplier;
  const surge = surgedFare - (base + distance + time);
  const total = surgedFare + tip + bonus;

  return {
    base,
    distance,
    time,
    tip,
    bonus,
    surge,
    total,
  } satisfies TripEarningBreakdown;
}

function isWithinDays(value: string, dayCount: number, now: Date) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - dayCount);
  return parsed >= threshold;
}

export function summarizeEarnings(earnings: EarningRecord[], payments: PaymentRecord[], now = new Date()) {
  const totalEarned = earnings.reduce((sum, earning) => sum + earning.amount, 0);
  const daily = earnings.filter((earning) => isWithinDays(earning.date, 1, now)).reduce((sum, earning) => sum + earning.amount, 0);
  const weekly = earnings.filter((earning) => isWithinDays(earning.date, 7, now)).reduce((sum, earning) => sum + earning.amount, 0);
  const monthly = earnings.filter((earning) => isWithinDays(earning.date, 30, now)).reduce((sum, earning) => sum + earning.amount, 0);
  const pendingPayments = payments.filter((payment) => payment.status !== 'completed').reduce((sum, payment) => sum + payment.amount, 0);
  const completedPayments = payments.filter((payment) => payment.status === 'completed').reduce((sum, payment) => sum + payment.amount, 0);
  const byType = earnings.reduce<Record<EarningType, number>>(
    (summary, earning) => {
      summary[earning.type] += earning.amount;
      return summary;
    },
    { base: 0, tip: 0, bonus: 0, surge: 0, adjustment: 0 },
  );

  return {
    totalEarned,
    daily,
    weekly,
    monthly,
    pendingPayments,
    completedPayments,
    walletBalance: totalEarned - completedPayments,
    byType,
  };
}

function readStorageValue(key: string) {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures. Live Firebase subscriptions remain the source of truth.
  }
}

function removeStorageValue(key: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage clear failures.
  }
}

export function getDriverDashboardCacheKey(driverId: string) {
  return `${DRIVER_CACHE_PREFIX}${driverId}`;
}

export function readDriverDashboardCache(driverId: string): DriverDashboardCache | null {
  const cachedValue = readStorageValue(getDriverDashboardCacheKey(driverId));
  if (!cachedValue) return null;

  try {
    const parsed = JSON.parse(cachedValue) as Partial<DriverDashboardCache>;
    return {
      driver: parsed.driver ? normalizeDriverRecord(parsed.driver, driverId) : null,
      rides: normalizeRideCollection(parsed.rides ?? {}, driverId),
      locations: normalizeLocationCollection(parsed.locations ?? {}, driverId),
      earnings: normalizeEarningCollection(parsed.earnings ?? {}, driverId),
      payments: normalizePaymentCollection(parsed.payments ?? {}, driverId),
      chatMessages: normalizeChatCollection(parsed.chatMessages ?? {}, driverId),
    };
  } catch {
    return null;
  }
}

export function writeDriverDashboardCache(driverId: string, cache: DriverDashboardCache) {
  writeStorageValue(getDriverDashboardCacheKey(driverId), JSON.stringify(cache));
}

export function clearDriverDashboardCache(driverId: string) {
  removeStorageValue(getDriverDashboardCacheKey(driverId));
}

export function getDriverQueueKey(driverId: string) {
  return `${DRIVER_QUEUE_PREFIX}${driverId}`;
}

export function readQueuedDriverMutations(driverId: string) {
  const cachedValue = readStorageValue(getDriverQueueKey(driverId));
  if (!cachedValue) return [] as QueuedDriverMutation[];
  try {
    const parsed = JSON.parse(cachedValue) as QueuedDriverMutation[];
    return Array.isArray(parsed)
      ? parsed.filter((item) => item && typeof item === 'object' && typeof item.path === 'string')
      : [];
  } catch {
    return [];
  }
}

export function writeQueuedDriverMutations(driverId: string, queue: QueuedDriverMutation[]) {
  writeStorageValue(getDriverQueueKey(driverId), JSON.stringify(queue));
}

export function clearQueuedDriverMutations(driverId: string) {
  removeStorageValue(getDriverQueueKey(driverId));
}
