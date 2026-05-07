/**
 * Feature flags — read from environment variables at runtime.
 *
 * ENABLE_SMS_OTP
 *   Controls whether seller accounts must complete a Twilio SMS OTP challenge
 *   during login.  With Twilio now approved, OTP is enabled by default and may
 *   be temporarily disabled only by explicitly setting the flag to "false".
 *
 *   "true" or unset — OTP is required for all seller sign-ins (full two-factor login).
 *   "false"         — OTP step is skipped; sellers sign in with email +
 *                     password only.  Use only as a temporary emergency fallback.
 */
export function isSmsOtpEnabled(): boolean {
  return process.env.ENABLE_SMS_OTP?.trim().toLowerCase() !== 'false';
}
