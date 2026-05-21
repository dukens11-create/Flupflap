/**
 * Shared constants and helpers for the live stream viewer state machine.
 * Extracted for testability — the React component imports from here.
 */

export const MAX_RECONNECT_ATTEMPTS = 3;
export const RECONNECT_STEP_DELAY_MS = 1200;
export const RECONNECT_MAX_DELAY_MS = 8000;
export const RECONNECT_JITTER_MS = 250;
export const WAITING_FOR_PUBLISHER_TIMEOUT_MS = 15000;

export const STREAM_RECONNECTING_MESSAGE =
  'Live stream connection was interrupted. Trying to reconnect…';
export const STREAM_TERMINAL_FAILURE_MESSAGE =
  'Unable to connect to this live stream right now. Please try again in a moment.';

export type ViewerConnectionStatus =
  | 'connecting'
  | 'waitingForPublisher'
  | 'live'
  | 'reconnecting'
  | 'failed'
  | 'ended';

/**
 * Returns the human-readable label for a viewer connection status.
 */
export function getConnectionStatusLabel(status: ViewerConnectionStatus): string {
  switch (status) {
    case 'live':
      return 'Live';
    case 'waitingForPublisher':
      return 'Waiting for stream…';
    case 'reconnecting':
      return 'Reconnecting…';
    case 'failed':
      return 'Unable to connect';
    case 'ended':
      return 'Stream ended';
    default:
      return 'Connecting…';
  }
}

/**
 * Computes the reconnect retry delay (with exponential backoff + jitter).
 * Uses a seeded value for jitter in tests so results are deterministic.
 * Jitter is factored in before capping so the total never exceeds RECONNECT_MAX_DELAY_MS.
 */
export function computeReconnectDelay(attempt: number, jitter = 0): number {
  return Math.min(
    RECONNECT_MAX_DELAY_MS,
    RECONNECT_STEP_DELAY_MS * (2 ** (attempt - 1)) + jitter,
  );
}

/**
 * Returns true when another reconnect attempt should be scheduled,
 * false when the terminal failure threshold has been reached.
 */
export function shouldAttemptReconnect(nextAttempt: number): boolean {
  return nextAttempt <= MAX_RECONNECT_ATTEMPTS;
}
