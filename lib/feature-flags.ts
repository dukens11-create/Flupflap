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
  for (let i = 0; i < 2; i += 1) {
    const startsWithDoubleQuote = normalized.startsWith('"') && normalized.endsWith('"');
    const startsWithSingleQuote = normalized.startsWith("'") && normalized.endsWith("'");
    if (!startsWithDoubleQuote && !startsWithSingleQuote) break;
    normalized = normalized.slice(1, -1).trim();
  }
  normalized = normalized.toLowerCase();

  return !['false', '0', 'off', 'no'].includes(normalized);
}
