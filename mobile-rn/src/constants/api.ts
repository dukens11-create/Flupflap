/**
 * App-wide constants for the FlupFlap React Native app.
 * Override BASE_URL at build time via environment / CI variables.
 */

/** Base URL of the FlupFlap backend API. */
export const BASE_URL: string =
  (typeof process !== 'undefined' && process.env?.FLUPFLAP_API_URL) ||
  'https://flupflap.com';

/** AsyncStorage key used to persist the session cookie. */
export const SESSION_COOKIE_KEY = 'flupflap_rn_session_cookie';

/** Maximum notifications fetched per request. */
export const NOTIFICATIONS_PAGE_SIZE = 50;
