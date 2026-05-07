const MAX_QUOTE_UNWRAP_PASSES = 2; // supports values like '"false"' from dashboard copy/paste.

function hasMatchingWrapperQuotes(value: string): boolean {
  return (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  );
}

/**
 * Feature flags — read from environment variables at runtime.
 *
 * ENABLE_SMS_OTP
 *   Controls whether seller accounts must complete a Twilio SMS OTP challenge
 *   during login. OTP is enabled by default and may be temporarily disabled
 *   only by explicitly setting the flag to a falsey string value.
 *
 *   true-ish or unset            — OTP is required for seller sign-ins.
 *   "false" / "0" / "off" / "no" — OTP step is skipped; sellers sign in with
 *                                   email + password only.
 *
 *   Quoted values are supported (e.g. ENABLE_SMS_OTP="false").
 */
export function isSmsOtpEnabled(): boolean {
  const raw = process.env.ENABLE_SMS_OTP;
  if (!raw) return true;

  let normalized = raw.trim();
  for (let iteration = 0; iteration < MAX_QUOTE_UNWRAP_PASSES; iteration += 1) {
    if (!hasMatchingWrapperQuotes(normalized)) break;
    normalized = normalized.slice(1, -1).trim();
  }
  normalized = normalized.toLowerCase();

  return !['false', '0', 'off', 'no'].includes(normalized);
}
