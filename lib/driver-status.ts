export const DRIVER_STATUS_STORAGE_KEY = 'flupflap.driver.status';
export const DRIVER_STATUS_LAST_SYNC_KEY = 'flupflap.driver.status.lastSync';

export const OFFLINE_REASONS = [
  'Taking a break',
  'Shift ended',
  'Vehicle issue',
  'Personal errand',
] as const;

export type DriverStatus = 'ONLINE' | 'OFFLINE';

export interface DriverStatusSnapshot {
  driverId: string;
  status: DriverStatus;
  reason: string | null;
  lastOnlineAt: string | null;
  version: number;
  updatedAt: string;
}

export function clampInactivityMinutes(minutes: number): number {
  if (!Number.isFinite(minutes)) return 30;
  return Math.max(1, Math.min(180, Math.floor(minutes)));
}

export function shouldAutoOffline(
  lastInteractionAtMs: number,
  inactivityMinutes: number,
  nowMs = Date.now(),
): boolean {
  if (!Number.isFinite(lastInteractionAtMs) || lastInteractionAtMs <= 0) {
    return false;
  }
  const limitMs = clampInactivityMinutes(inactivityMinutes) * 60_000;
  return nowMs - lastInteractionAtMs >= limitMs;
}

export function formatLastOnlineTime(lastOnlineAt: string | null): string {
  if (!lastOnlineAt) return 'Last online: —';
  const date = new Date(lastOnlineAt);
  if (Number.isNaN(date.getTime())) return 'Last online: —';
  return `Last online: ${date.toLocaleString()}`;
}
