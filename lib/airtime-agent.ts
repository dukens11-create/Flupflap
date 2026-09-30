export function normalizeIso2(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function calculateAgentSaleEconomics(amountCents: number, commissionBps: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  const safeBps = Math.max(0, Math.min(5000, Math.trunc(commissionBps || 0)));
  const commissionCents = Math.floor((amountCents * safeBps) / 10_000);
  return {
    amountCents,
    commissionBps: safeBps,
    commissionCents,
    debitCents: amountCents - commissionCents,
  };
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return '*'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}
