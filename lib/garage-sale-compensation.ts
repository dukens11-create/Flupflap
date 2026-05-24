export type GarageSaleCompensationReason = 'ended_early' | 'system_cutoff';

export type GarageSaleCompensationAudit = {
  reason: GarageSaleCompensationReason;
  note?: string;
  grantedBy: string;
  sourceSale: string;
  at: string;
  replacement?: string;
};

export const GARAGE_SALE_COMPENSATION_REASON_LABELS: Record<GarageSaleCompensationReason, string> = {
  ended_early: 'Live ended early',
  system_cutoff: 'Platform issue / system cutoff',
};
export const GARAGE_SALE_COMPENSATION_NOTE_REQUIRED_MESSAGE = 'Compensation note is required for audit history';
export const GARAGE_SALE_COMPENSATION_NOT_ELIGIBLE_MESSAGE = 'Compensation only available once a paid approved live has started and before its scheduled end.';
export const GARAGE_SALE_COMPENSATION_OVERRIDE_REQUIRED_MESSAGE = 'Compensation is locked under standard rules. Use admin override with an audit note if this paid live was disrupted.';

type GarageSaleCompensationEligibilityInput = {
  isLive: boolean;
  isArchived: boolean;
  isSpam: boolean;
  status: string;
  paymentStatus: string;
  startDate: Date;
  endDate: Date;
};

export function isGarageSaleCompensationEligible(
  sale: GarageSaleCompensationEligibilityInput,
  now = new Date(),
) {
  if (sale.isSpam) return false;
  if (sale.paymentStatus !== 'PAID') return false;
  if (sale.status !== 'APPROVED' && sale.status !== 'EXPIRED') return false;
  if (sale.startDate > now) return false;
  return true;
}

export function isGarageSaleCompensationOverrideEligible(
  sale: GarageSaleCompensationEligibilityInput,
  now = new Date(),
) {
  if (sale.isSpam) return false;
  if (sale.paymentStatus !== 'PAID') return false;
  if (sale.startDate > now) return false;
  return (sale.status === 'HIDDEN' || sale.isArchived)
    && sale.status !== 'APPROVED'
    && sale.status !== 'EXPIRED';
}

export function getGarageSaleCompensationIneligibilityReason(
  sale: GarageSaleCompensationEligibilityInput,
  now = new Date(),
) {
  if (sale.isSpam) return 'Compensation is unavailable for spam listings.';
  if (sale.paymentStatus !== 'PAID') return 'Compensation is only available for paid listings.';
  if (sale.startDate > now) return 'Compensation becomes available once the approved live has started.';
  if (isGarageSaleCompensationOverrideEligible(sale, now)) {
    return GARAGE_SALE_COMPENSATION_OVERRIDE_REQUIRED_MESSAGE;
  }
  if (sale.status !== 'APPROVED' && sale.status !== 'EXPIRED') {
    return 'Compensation is only available for approved or expired live sessions.';
  }
  return GARAGE_SALE_COMPENSATION_NOT_ELIGIBLE_MESSAGE;
}

export function buildGarageSaleCompensationSourceKey(saleId: string) {
  return `garage_sale_early_end_compensation:${saleId}`;
}

export function normalizeGarageSaleCompensationNote(note?: string | null) {
  const trimmedNote = note?.trim();
  return trimmedNote ? trimmedNote : undefined;
}

export function formatGarageSaleCompensationReason(reason: GarageSaleCompensationReason) {
  return GARAGE_SALE_COMPENSATION_REASON_LABELS[reason];
}

export function formatGarageSaleCompensationSummary(
  reason: GarageSaleCompensationReason,
  note?: string | null,
) {
  const trimmedNote = normalizeGarageSaleCompensationNote(note);
  if (!trimmedNote) return formatGarageSaleCompensationReason(reason);
  return `${formatGarageSaleCompensationReason(reason)} — ${trimmedNote}`;
}

export function buildGarageSaleCompensationAuditLine(audit: GarageSaleCompensationAudit) {
  return `[compensation] ${JSON.stringify({
    ...audit,
    note: normalizeGarageSaleCompensationNote(audit.note),
  })}`;
}

export function parseGarageSaleCompensationAudit(adminNotes?: string | null): GarageSaleCompensationAudit | null {
  if (!adminNotes) return null;

  for (const line of adminNotes.split('\n').reverse()) {
    const match = line.match(/\[compensation\]\s+(\{.*\})/);
    if (!match) continue;

    try {
      const parsed = JSON.parse(match[1]) as Partial<GarageSaleCompensationAudit>;
      if (
        (parsed.reason === 'ended_early' || parsed.reason === 'system_cutoff')
        && typeof parsed.grantedBy === 'string'
        && typeof parsed.sourceSale === 'string'
        && typeof parsed.at === 'string'
      ) {
        return {
          reason: parsed.reason,
          note: normalizeGarageSaleCompensationNote(parsed.note),
          grantedBy: parsed.grantedBy,
          sourceSale: parsed.sourceSale,
          at: parsed.at,
          replacement: typeof parsed.replacement === 'string' ? parsed.replacement : undefined,
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}
