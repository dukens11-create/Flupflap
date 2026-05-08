import { DeliveryStatus } from '@prisma/client';

export type ShippingProviderKey = 'manual' | 'shippo';

type CarrierTrackingResponse = {
  providerShipmentId?: string | null;
  deliveryStatus: DeliveryStatus;
  deliveryStatusDetail: string | null;
  externalTrackingUrl: string | null;
  syncedAt: Date;
};

const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  LABEL_CREATED: 'Label created',
  PRE_TRANSIT: 'Pre-transit',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  AVAILABLE_FOR_PICKUP: 'Available for pickup',
  EXCEPTION: 'Delivery exception',
  UNKNOWN: 'Status unavailable',
};

export function getDeliveryStatusLabel(status: DeliveryStatus | null | undefined): string {
  if (!status) return 'Not available';
  return DELIVERY_STATUS_LABELS[status] ?? status;
}

export function getShippingProvider(): {
  key: ShippingProviderKey;
  label: string;
  supportsCarrierTracking: boolean;
} {
  const configured = (process.env.SHIPPING_PROVIDER ?? '').trim().toLowerCase();
  const shippoToken = (process.env.SHIPPO_API_KEY ?? '').trim();
  if (configured === 'shippo' && shippoToken) {
    return { key: 'shippo', label: 'Shippo', supportsCarrierTracking: true };
  }
  return { key: 'manual', label: 'Manual shipping', supportsCarrierTracking: false };
}

export function buildInternalShippingLabelUrl(orderId: string): string {
  return `/orders/${orderId}/label`;
}

export function normalizeCarrierName(input: string): string {
  return input.trim().replace(/\s+/g, ' ');
}

export function normalizeCarrierCode(input: string): string {
  return normalizeCarrierName(input).toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function inferDeliveryStatus(input: {
  deliveryStatus?: string | null;
  trackingNumber?: string | null;
}): DeliveryStatus {
  const requested = (input.deliveryStatus ?? '').trim().toUpperCase();
  if (requested && Object.values(DeliveryStatus).includes(requested as DeliveryStatus)) {
    return requested as DeliveryStatus;
  }
  return input.trackingNumber?.trim() ? DeliveryStatus.IN_TRANSIT : DeliveryStatus.LABEL_CREATED;
}

export function mapDeliveryStatusToOrderStatus(status: DeliveryStatus): 'PAID' | 'SHIPPED' | 'DELIVERED' {
  if (status === DeliveryStatus.DELIVERED) return 'DELIVERED';
  if (status === DeliveryStatus.LABEL_CREATED) return 'PAID';
  return 'SHIPPED';
}

export function buildCarrierTrackingUrl(carrier: string | null | undefined, trackingNumber: string | null | undefined): string | null {
  const tracking = trackingNumber?.trim();
  if (!tracking) return null;
  const code = normalizeCarrierCode(carrier ?? '');
  if (code.includes('ups')) {
    return `https://www.ups.com/track?trackingNumber=${encodeURIComponent(tracking)}`;
  }
  if (code.includes('fedex')) {
    return `https://www.fedex.com/fedextrack/?tracknumbers=${encodeURIComponent(tracking)}`;
  }
  if (code.includes('usps') || code.includes('postal')) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(tracking)}`;
  }
  if (code.includes('dhl')) {
    return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(tracking)}`;
  }
  return null;
}

function mapShippoCarrierTrackingStatus(status: string | null | undefined, detail: string | null | undefined): DeliveryStatus {
  const normalized = (status ?? '').trim().toUpperCase();
  if (normalized === 'DELIVERED') return DeliveryStatus.DELIVERED;
  if (normalized === 'PRE_TRANSIT') return DeliveryStatus.PRE_TRANSIT;
  if (normalized === 'TRANSIT') {
    if ((detail ?? '').toLowerCase().includes('out for delivery')) {
      return DeliveryStatus.OUT_FOR_DELIVERY;
    }
    return DeliveryStatus.IN_TRANSIT;
  }
  if (normalized === 'AVAILABLE_FOR_PICKUP') return DeliveryStatus.AVAILABLE_FOR_PICKUP;
  if (normalized === 'FAILURE' || normalized === 'RETURNED') return DeliveryStatus.EXCEPTION;
  return DeliveryStatus.UNKNOWN;
}

export async function refreshCarrierTracking(input: {
  carrier: string;
  trackingNumber: string;
}): Promise<CarrierTrackingResponse | null> {
  const provider = getShippingProvider();
  const trackingNumber = input.trackingNumber.trim();
  const carrier = normalizeCarrierName(input.carrier);
  if (!provider.supportsCarrierTracking || !trackingNumber || !carrier) {
    return null;
  }

  if (provider.key !== 'shippo') {
    return null;
  }

  const token = (process.env.SHIPPO_API_KEY ?? '').trim();
  const response = await fetch('https://api.goshippo.com/tracks/', {
    method: 'POST',
    headers: {
      Authorization: `ShippoToken ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      carrier: normalizeCarrierCode(carrier),
      tracking_number: trackingNumber,
    }),
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Shippo tracking lookup failed (${response.status}): ${text.slice(0, 500)}`);
  }

  const payload = await response.json() as {
    carrier?: string;
    tracking_number?: string;
    transaction?: string;
    tracking_status?: {
      status?: string;
      status_details?: string | null;
    } | null;
  };

  const detail = payload.tracking_status?.status_details ?? null;
  return {
    providerShipmentId: payload.transaction ?? null,
    deliveryStatus: mapShippoCarrierTrackingStatus(payload.tracking_status?.status, detail),
    deliveryStatusDetail: detail,
    externalTrackingUrl: buildCarrierTrackingUrl(payload.carrier ?? carrier, payload.tracking_number ?? trackingNumber),
    syncedAt: new Date(),
  };
}
