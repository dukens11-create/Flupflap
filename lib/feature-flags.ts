/**
 * Feature flags — read from environment variables at runtime.
 *
 * ENABLE_SMS_OTP
 *   Controls whether seller accounts must complete a Twilio SMS OTP challenge
 *   during login.  Set to "true" once Twilio A2P registration is approved and
 *   SMS delivery is verified.
 *
 *   "true"  — OTP is required for all seller sign-ins (full two-factor login).
 *   "false" or unset — OTP step is skipped; sellers sign in with email +
 *             password only.  Use only while Twilio registration is pending.
 */
export function isSmsOtpEnabled(): boolean {
  return process.env.ENABLE_SMS_OTP === 'true';
}
