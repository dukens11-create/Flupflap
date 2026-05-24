export type GarageSaleCompensationReason = 'ended_early' | 'system_cutoff';

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
  if (sale.isLive || sale.isArchived || sale.isSpam) return false;
  if (sale.status !== 'APPROVED' || sale.paymentStatus !== 'PAID') return false;
  if (sale.startDate > now) return false;
  if (sale.endDate <= now) return false;
  return true;
}

export function buildGarageSaleCompensationSourceKey(saleId: string) {
  return `garage_sale_early_end_compensation:${saleId}`;
}
