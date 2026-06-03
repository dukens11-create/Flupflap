/**
 * HTML email templates for transactional messages.
 *
 * Each function returns { subject, html } so callers can pass both directly
 * to sendEmail() without duplicating subject strings.
 */

export function passwordResetEmail(resetUrl: string): { subject: string; html: string } {
  return {
    subject: 'Reset your FlupFlap password',
    html: `<p>Hi,</p>
<p>We received a request to reset the password for your FlupFlap account.</p>
<p>
  <a href="${resetUrl}"
     style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none;font-weight:bold;">
    Reset password
  </a>
</p>
<p>Or copy and paste this link into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
<p>This link expires in <strong>1 hour</strong>. If you didn&apos;t request a password reset, you can safely ignore this email.</p>
<p>— The FlupFlap team</p>`,
  };
}

export function sellerPurchaseEmail(input: {
  sellerName?: string | null;
  buyerSummary: string;
  itemSummary: string;
  orderReference: string;
  purchasedAtIso: string;
  actionUrl: string;
}): { subject: string; html: string } {
  const greetingName = input.sellerName?.trim() || 'there';
  const subject = `New purchase received (${input.orderReference})`;

  return {
    subject,
    html: `<p>Hi ${greetingName},</p>
<p>${input.buyerSummary} purchased ${input.itemSummary}.</p>
<p><strong>Order:</strong> ${input.orderReference}<br/>
<strong>Purchased:</strong> ${input.purchasedAtIso}</p>
<p><a href="${input.actionUrl}">View order details</a></p>
<p>— The FlupFlap team</p>`,
  };
}
