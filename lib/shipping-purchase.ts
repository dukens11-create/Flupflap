import { createHash } from 'crypto';

type PurchaseGuardOrder = {
  shipmentStatus?: string | null;
  labelUrl?: string | null;
  trackingNumber?: string | null;
  carrier?: string | null;
  shippingCarrier?: string | null;
  shippingService?: string | null;
  trackingUrl?: string | null;
  shipmentId?: string | null;
};

export function buildShippingPurchaseIdempotencyKey(params: {
  orderId: string;
  shipmentId: string;
  rateId: string;
}) {
  const normalized = `${params.orderId.trim()}:${params.shipmentId.trim()}:${params.rateId.trim()}`;
  return `ship-label:${createHash('sha256').update(normalized).digest('hex')}`;
}

export function hasActivePurchasedLabel(order: PurchaseGuardOrder) {
  const status = (order.shipmentStatus ?? '').toUpperCase();
  const hasLabelArtifacts = !!(order.labelUrl || order.trackingNumber);
  return hasLabelArtifacts || status === 'LABEL_PURCHASED' || status === 'PURCHASED';
}

export function classifyShippingPurchaseError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown shipping provider error');
  const upper = message.toUpperCase();
  const retryable = (
    upper.includes('TIMEOUT')
    || upper.includes('TIMED OUT')
    || upper.includes('ECONNRESET')
    || upper.includes('ENOTFOUND')
    || upper.includes('EAI_AGAIN')
    || upper.includes('503')
    || upper.includes('429')
    || upper.includes('TRY AGAIN')
  );
  return {
    message,
    retryable,
    unknownOutcome: retryable,
  };
}
