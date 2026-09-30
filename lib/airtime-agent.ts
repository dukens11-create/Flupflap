export type ProviderTopupDisposition = 'SUCCESS' | 'PENDING' | 'FAILURE';

export function normalizeIso2(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function normalizeCurrency(value: unknown): string | null {
  const code = String(value ?? '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function normalizeIdempotencyKey(value: unknown): string | null {
  const key = String(value ?? '').trim();
  return /^[A-Za-z0-9._:-]{8,128}$/.test(key) ? key : null;
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

export function classifyProviderTopupStatus(value: unknown): ProviderTopupDisposition {
  const status = String(value ?? '').trim().toUpperCase();
  if (['SUCCESS', 'SUCCESSFUL', 'COMPLETED'].includes(status)) return 'SUCCESS';
  if (['FAILED', 'REFUNDED', 'REVERSED', 'CANCELLED', 'CANCELED', 'REJECTED'].includes(status)) return 'FAILURE';
  return 'PENDING';
}

export function validateWalletAdjustment(amountCents: unknown): number | null {
  const amount = Number(amountCents);
  if (!Number.isInteger(amount) || amount === 0) return null;
  return amount;
}

export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length <= 4) return '*'.repeat(digits.length);
  return '*'.repeat(Math.max(0, digits.length - 4)) + digits.slice(-4);
}
