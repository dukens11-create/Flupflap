/**
 * Twilio client — lazily initialized so the build succeeds without the env vars.
 *
 * Required environment variables (set in Render / .env.local):
 *   TWILIO_ACCOUNT_SID   – Twilio account SID (starts with "AC…")
 *   TWILIO_AUTH_TOKEN    – Twilio auth token
 *   TWILIO_FROM_NUMBER   – Twilio phone number to send SMS from (e.g. "+15005550006")
 *
 * If any of these are absent, sendSms() falls back to dev/mock mode: the OTP
 * is printed to the server console instead of being sent by SMS.  This is safe
 * for local development and CI but MUST be replaced with real credentials in
 * production.
 */

function isTwilioConfigured(): boolean {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER,
  );
}

/**
 * Send an SMS message.
 *
 * In production (Twilio configured): sends via Twilio REST API.
 * In dev/mock mode: logs the message to the server console and resolves.
 */
export async function sendSms(to: string, body: string): Promise<void> {
  if (!isTwilioConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      // In production without Twilio configured, refuse to proceed so the
      // operator is alerted immediately rather than silently skipping 2FA.
      throw new Error(
        'Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
        'and TWILIO_FROM_NUMBER environment variables.',
      );
    }
    // Dev / mock mode — logs OTP to console for local development only.
    console.warn('[OTP DEV MODE] SMS not sent. Twilio env vars missing.');
    console.info(`[OTP DEV MODE] To: ${to}  Message: ${body}`);
    return;
  }

  // Dynamically import so the build succeeds without the env vars.
  const twilio = (await import('twilio')).default;
  const client = twilio(
    process.env.TWILIO_ACCOUNT_SID!,
    process.env.TWILIO_AUTH_TOKEN!,
  );
  await client.messages.create({
    to,
    from: process.env.TWILIO_FROM_NUMBER!,
    body,
  });
}
