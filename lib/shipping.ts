const EASYPOST_API_BASE = 'https://api.easypost.com/v2';
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
  labelUrl: string | null;
  trackingUrl: string | null;
};

function getEasyPostApiKey() {
  const key = (process.env.EASYPOST_API_KEY ?? '').trim();
  if (!key) {
    throw new Error('EASYPOST_API_KEY is not set.');
  }
  return key;
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

async function easyPostRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
  const auth = Buffer.from(`${getEasyPostApiKey()}:`).toString('base64');
  const res = await fetch(`${EASYPOST_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.error?.message || payload?.message || 'EasyPost request failed.';
    throw new Error(message);
  }
  return payload;
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
  const payload = await easyPostRequest('/shipments', 'POST', {
    shipment: {
      to_address: serializeAddress(params.toAddress),
      from_address: serializeAddress(params.fromAddress),
      parcel: {
        weight: params.weightOz,
        length: params.lengthIn,
        width: params.widthIn,
        height: params.heightIn,
      },
    },
  });

  const shipmentId = typeof payload?.id === 'string' ? payload.id : null;
  if (!shipmentId) {
    throw new Error('EasyPost did not return a shipment id.');
  }

  const rates: ShipmentRateQuote[] = Array.isArray(payload?.rates)
    ? payload.rates
      .filter((rate: any) => SUPPORTED_CARRIERS.has(String(rate?.carrier ?? '').toUpperCase()))
      .map((rate: any) => {
        const carrier = String(rate?.carrier ?? '').toUpperCase();
        const currency = String(rate?.currency ?? '').toUpperCase();
        return {
          id: String(rate?.id ?? ''),
          carrier,
          service: String(rate?.service ?? ''),
          rate: String(rate?.rate ?? ''),
          currency,
          deliveryDays: parseDeliveryDays(rate?.delivery_days),
        };
      })
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
  const payload = await easyPostRequest(`/shipments/${params.shipmentId}/buy`, 'POST', {
    rate: { id: params.rateId },
  });

  const trackingCode = typeof payload?.tracking_code === 'string' ? payload.tracking_code : null;
  const selectedCarrier = typeof payload?.selected_rate?.carrier === 'string'
    ? payload.selected_rate.carrier.toUpperCase()
    : null;
  const carrier = selectedCarrier || (
    typeof payload?.tracker?.carrier === 'string'
      ? payload.tracker.carrier.toUpperCase()
      : null
  );
  const labelUrl = typeof payload?.postage_label?.label_pdf_url === 'string'
    ? payload.postage_label.label_pdf_url
    : null;
  const trackingUrl = typeof payload?.tracker?.public_url === 'string'
    ? payload.tracker.public_url
    : buildTrackingUrl(carrier, trackingCode);

  return {
    shipmentId: typeof payload?.id === 'string' ? payload.id : params.shipmentId,
    shipmentStatus: typeof payload?.status === 'string' ? payload.status : null,
    trackingNumber: trackingCode,
    carrier,
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
