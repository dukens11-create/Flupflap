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

  const normalized = raw
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
    .trim()
    .toLowerCase();

  return !['false', '0', 'off', 'no'].includes(normalized);
}
