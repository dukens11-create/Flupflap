/**
 * Email utility for transactional emails (e.g. password reset).
 *
 * In development (or when RESEND_API_KEY is not set) emails are not sent —
 * the full message is logged to the console instead so developers can work
 * without configuring a real provider.
 *
 * In production, set RESEND_API_KEY to enable delivery via Resend
 * (https://resend.com).  The from address is read from RESEND_FROM_EMAIL
 * and defaults to "noreply@flupflap.com" when not set.
 */

import { Resend } from 'resend';

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'noreply@flupflap.com';

/**
 * Send a transactional email.
 *
 * @param to      Recipient email address.
 * @param subject Email subject line.
 * @param html    HTML body content.
 * @returns       `true` if the email was delivered (or dev-logged), `false` on error.
 */
export async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  // Dev / unconfigured: log instead of sending so the app works without a provider.
  if (!apiKey) {
    console.log(
      `[email] (no RESEND_API_KEY — not sent)\n  To: ${to}\n  Subject: ${subject}\n  Body:\n${html}`,
    );
    return true;
  }

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });

    if (error) {
      // Log actionable details — common causes: invalid API key, unverified
      // sending domain, or recipient address rejected by Resend.
      console.error('[email] Resend delivery error', {
        to,
        subject,
        errorName: error.name,
        errorMessage: error.message,
        hint: 'Check RESEND_API_KEY validity and that RESEND_FROM_EMAIL domain is verified in the Resend dashboard.',
      });
      return false;
    }

    console.info('[email] Email sent via Resend', { to, subject });
    return true;
  } catch (err) {
    console.error('[email] Unexpected error sending email', {
      to,
      subject,
      error: (err as any)?.message,
    });
    return false;
  }
}
