export interface Coordinates {
  lat: number;
  lng: number;
}

export interface TimedCoordinates extends Coordinates {
  timestamp: number;
}

const EARTH_RADIUS_MILES = 3958.8;
const METERS_PER_MILE = 1609.344;

export function toRadians(deg: number) {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMiles(a: Coordinates, b: Coordinates) {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const hav =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(hav), Math.sqrt(1 - hav));
}

export function distanceMeters(a: Coordinates, b: Coordinates) {
  return haversineDistanceMiles(a, b) * METERS_PER_MILE;
}

export function normalizeSpeedMph(speedMetersPerSecond: number | null | undefined) {
  if (!Number.isFinite(speedMetersPerSecond ?? NaN) || (speedMetersPerSecond ?? 0) < 0) {
    return null;
  }

  return (speedMetersPerSecond as number) * 2.2369362920544;
}

export function estimateEtaMinutes(distanceMiles: number, speedMph: number | null | undefined) {
  const effectiveSpeed = Number.isFinite(speedMph ?? NaN) && (speedMph ?? 0) > 0 ? (speedMph as number) : 22;
  return Math.max(1, Math.round((distanceMiles / effectiveSpeed) * 60));
}

export function getAccuracyLabel(accuracyMeters: number | null | undefined) {
  if (!Number.isFinite(accuracyMeters ?? NaN) || (accuracyMeters ?? 0) <= 0) {
    return 'Unavailable';
  }

  if ((accuracyMeters as number) <= 10) return 'High';
  if ((accuracyMeters as number) <= 30) return 'Medium';
  return 'Low';
}

export function shouldApplyLocationUpdate(
  previous: TimedCoordinates | null,
  next: TimedCoordinates,
  options?: { minDistanceMeters?: number; minTimeMs?: number },
) {
  if (!previous) return true;

  const minDistanceMeters = options?.minDistanceMeters ?? 10;
  const minTimeMs = options?.minTimeMs ?? 2000;

  const elapsed = next.timestamp - previous.timestamp;
  const movedMeters = distanceMeters(previous, next);

  return elapsed >= minTimeMs || movedMeters >= minDistanceMeters;
}
