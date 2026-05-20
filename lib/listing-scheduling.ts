export const SCHEDULING_DISABLED_ERROR =
  'Scheduling functionality is currently disabled. Please save as draft or publish now.';

export function getSchedulingDisabledError(action: unknown): string | null {
  return action === 'SCHEDULE' ? SCHEDULING_DISABLED_ERROR : null;
}
