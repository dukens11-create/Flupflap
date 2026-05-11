const SHIPPO_API_BASE = 'https://api.goshippo.com';
const SUPPORTED_CARRIERS = new Set(['USPS', 'UPS', 'FEDEX']);

type AddressInput = {
  name?: string | null;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country?: string | null;
  phone?: string | null;
};

export type ShipmentRateQuote = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  deliveryDays: number | null;
};

export type ShipmentPurchaseResult = {
  shipmentId: string;
  shipmentStatus: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  service: string | null;
  labelUrl: string | null;
  trackingUrl: string | null;
};

function getShippoApiToken() {
  const token = (process.env.SHIPPO_API_TOKEN ?? '').trim();
  if (!token) {
    throw new Error('SHIPPO_API_TOKEN is not set.');
  }
  return token;
}

function serializeAddress(address: AddressInput) {
  return {
    name: address.name?.trim() || undefined,
    street1: address.street1,
    street2: address.street2?.trim() || undefined,
    city: address.city,
    state: address.state,
    zip: address.zip,
    country: address.country?.trim() || 'US',
    phone: address.phone?.trim() || undefined,
  };
}

async function shippoRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
  const res = await fetch(`${SHIPPO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `ShippoToken ${getShippoApiToken()}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.detail || payload?.error?.message || payload?.message || 'Shippo request failed.';
    throw new Error(message);
  }
  return payload;
}

function normalizeCarrier(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  // Shippo provider names may include spaces/punctuation; normalize to token form
  // so we can compare against the supported carrier whitelist consistently.
  const normalized = raw.replace(/[^a-z0-9]/gi, '').toUpperCase();
  return normalized;
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseDeliveryDays(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export async function createShipmentRates(params: {
  toAddress: AddressInput;
  fromAddress: AddressInput;
  weightOz: number;
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}) {
  const payload = await shippoRequest('/shipments/', 'POST', {
    address_to: serializeAddress(params.toAddress),
    address_from: serializeAddress(params.fromAddress),
    parcels: [
      {
        length: String(params.lengthIn),
        width: String(params.widthIn),
        height: String(params.heightIn),
        distance_unit: 'in',
        weight: String(params.weightOz),
        mass_unit: 'oz',
      },
    ],
    async: false,
  });

  const shipmentId = typeof payload?.object_id === 'string' ? payload.object_id : null;
  if (!shipmentId) {
    throw new Error('Shippo did not return a shipment id.');
  }

  const rates: ShipmentRateQuote[] = Array.isArray(payload?.rates)
    ? payload.rates
      .map((rate: any) => {
        const carrier = normalizeCarrier(rate?.provider);
        const currency = String(rate?.currency ?? '').toUpperCase();
        return {
          id: String(rate?.object_id ?? ''),
          carrier,
          service: parseOptionalString(rate?.servicelevel?.name)
            ?? parseOptionalString(rate?.servicelevel?.token)
            ?? '',
          rate: String(rate?.amount ?? ''),
          currency,
          deliveryDays: parseDeliveryDays(rate?.estimated_days),
        };
      })
      .filter((rate: ShipmentRateQuote) => SUPPORTED_CARRIERS.has(rate.carrier))
      .filter((rate: ShipmentRateQuote) => (
        !!rate.id
        && !!rate.carrier
        && !!rate.service
        && !!rate.rate
        && !!rate.currency
      ))
      .filter((rate: ShipmentRateQuote) => Number.isFinite(Number(rate.rate)))
      .map((rate: ShipmentRateQuote) => ({
        ...rate,
        rate: Number(rate.rate).toFixed(2),
      }))
      .sort((a: ShipmentRateQuote, b: ShipmentRateQuote) => Number(a.rate) - Number(b.rate))
    : [];

  return { shipmentId, rates };
}

export async function purchaseShipmentRate(params: {
  shipmentId: string;
  rateId: string;
}): Promise<ShipmentPurchaseResult> {
  const payload = await shippoRequest('/transactions/', 'POST', {
    rate: params.rateId,
    label_file_type: 'PDF',
    async: false,
  });

  const trackingCode = parseOptionalString(payload?.tracking_number);
  const carrier = normalizeCarrier(payload?.rate?.provider || payload?.provider) || null;
  const service = parseOptionalString(payload?.rate?.servicelevel?.name)
    ?? parseOptionalString(payload?.rate?.servicelevel?.token);
  const labelUrl = parseOptionalString(payload?.label_url);
  const trackingUrl = parseOptionalString(payload?.tracking_url_provider)
    || buildTrackingUrl(carrier, trackingCode);
  // Shippo transaction payloads are not fully consistent across rate types, so
  // resolve the shipment id from the most specific to least specific source.
  const rateShipmentId = parseOptionalString(payload?.rate?.shipment);
  const transactionShipmentObjectId = parseOptionalString(payload?.shipment?.object_id);
  const transactionShipmentId = parseOptionalString(payload?.shipment);
  const responseShipmentId = rateShipmentId
    ?? transactionShipmentObjectId
    ?? transactionShipmentId
    ?? params.shipmentId;

  return {
    shipmentId: responseShipmentId,
    shipmentStatus: typeof payload?.status === 'string' ? payload.status : null,
    trackingNumber: trackingCode,
    carrier,
    service,
    labelUrl,
    trackingUrl,
  };
}

export function buildTrackingUrl(carrier?: string | null, trackingNumber?: string | null) {
  if (!trackingNumber) return null;
  const encoded = encodeURIComponent(trackingNumber);
  const normalizedCarrier = (carrier ?? '').toUpperCase();
  if (normalizedCarrier === 'USPS') {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`;
  }
  if (normalizedCarrier === 'UPS') {
    return `https://www.ups.com/track?tracknum=${encoded}`;
  }
  if (normalizedCarrier === 'FEDEX') {
    return `https://www.fedex.com/fedextrack/?trknbr=${encoded}`;
  }
  return null;
}
