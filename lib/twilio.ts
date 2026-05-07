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

function maskPhoneForLogs(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `***-***-${digits.slice(-4)}`;
}

/** Log a structured error for actionable server-side diagnostics. */
function logSmsError(to: string, err: unknown): void {
  const errObj = err as any;
  console.error('[SMS] Failed to send message', {
    to: maskPhoneForLogs(to),
    from: maskPhoneForLogs(process.env.TWILIO_FROM_NUMBER ?? ''),
    env: process.env.NODE_ENV,
    twilioConfigured: isTwilioConfigured(),
    errorCode: errObj?.code,
    errorStatus: errObj?.status,
    errorMessage: errObj?.message,
    moreInfo: errObj?.moreInfo,
  });
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
      const requiredVars = [
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_FROM_NUMBER',
      ] as const;
      const missingVars = requiredVars.filter((name) => !process.env[name]);
      // In production without Twilio configured, refuse to proceed so the
      // operator is alerted immediately rather than silently skipping 2FA.
      const err = new Error(
        '[SMS] Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
        'and TWILIO_FROM_NUMBER environment variables.',
      );
      console.error(err.message, {
        to: maskPhoneForLogs(to),
        env: process.env.NODE_ENV,
        missingVars,
      });
      throw err;
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
  try {
    const message = await client.messages.create({
      to,
      from: process.env.TWILIO_FROM_NUMBER!,
      body,
    });
    console.info('[SMS] Message accepted by Twilio', {
      to: maskPhoneForLogs(to),
      from: maskPhoneForLogs(process.env.TWILIO_FROM_NUMBER!),
      messageSid: message.sid,
      status: message.status,
    });
  } catch (err) {
    logSmsError(to, err);
    throw err;
  }
}
