const SHIPPO_API_BASE = 'https://api.goshippo.com';
const SUPPORTED_CARRIERS = new Set(['USPS', 'UPS', 'FEDEX']);

/**
 * Map common country full names / aliases to ISO 3166-1 alpha-2 codes.
 * Shippo requires the 2-letter code; sellers may have stored a full name.
 */
const COUNTRY_NAME_TO_CODE: Record<string, string> = {
  'united states': 'US',
  'united states of america': 'US',
  'usa': 'US',
  'canada': 'CA',
  'united kingdom': 'GB',
  'great britain': 'GB',
  'uk': 'GB',
  'australia': 'AU',
};

/** Normalize a country value to a 2-letter ISO code. Leaves already-valid 2-letter codes as-is. */
function normalizeCountryCode(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return 'US';
  if (trimmed.length === 2) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  return COUNTRY_NAME_TO_CODE[lower] ?? trimmed.toUpperCase();
}

/**
 * Map US state full names to their 2-letter USPS abbreviations.
 * Shippo (and most carriers) require the abbreviation for US addresses.
 */
const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI',
  'american samoa': 'AS', 'northern mariana islands': 'MP',
};

/**
 * Normalize a US state value to its 2-letter abbreviation.
 * Leaves already-abbreviated (≤2 chars) or non-US values as-is.
 */
function normalizeStateCode(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim();
  if (trimmed.length <= 2) return trimmed.toUpperCase();
  const abbr = US_STATE_NAME_TO_ABBR[trimmed.toLowerCase()];
  return abbr ?? trimmed;
}

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
  const country = normalizeCountryCode(address.country);
  // Normalize state to 2-letter abbreviation for US addresses; carriers require it.
  const state = country === 'US'
    ? normalizeStateCode(address.state)
    : (address.state?.trim() ?? '');
  return {
    name: address.name?.trim() || undefined,
    street1: address.street1,
    street2: address.street2?.trim() || undefined,
    city: address.city,
    state,
    zip: address.zip,
    country,
    phone: address.phone?.trim() || undefined,
  };
}

const SHIPPO_REQUEST_TIMEOUT_MS = 30_000;

async function shippoRequest(path: string, method: 'GET' | 'POST', body?: unknown) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHIPPO_REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${SHIPPO_API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `ShippoToken ${getShippoApiToken()}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Shipping rate request timed out. Please try again.');
    }
    throw err;
  }
  clearTimeout(timeoutId);

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const message = payload?.detail || payload?.error?.message || payload?.message || 'Shippo request failed.';
    throw new Error(message);
  }
  return payload;
}

function normalizeCarrier(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'USPS' || raw === 'UPS') return raw;
  if (raw === 'FEDEX' || raw === 'FED_EX' || raw === 'FED-EX' || raw === 'FED EX') return 'FEDEX';
  return raw;
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
  weightValue: number;
  weightUnit?: 'lb' | 'oz';
  lengthIn: number;
  widthIn: number;
  heightIn: number;
}) {
  // Validate package inputs before hitting the Shippo API.
  if (!Number.isFinite(params.weightValue) || params.weightValue <= 0) {
    throw new Error('Package weight must be a positive number.');
  }
  if (!Number.isFinite(params.lengthIn) || params.lengthIn <= 0) {
    throw new Error('Package length must be a positive number.');
  }
  if (!Number.isFinite(params.widthIn) || params.widthIn <= 0) {
    throw new Error('Package width must be a positive number.');
  }
  if (!Number.isFinite(params.heightIn) || params.heightIn <= 0) {
    throw new Error('Package height must be a positive number.');
  }
  if (!params.toAddress.street1?.trim() || !params.toAddress.city?.trim()
      || !params.toAddress.state?.trim() || !params.toAddress.zip?.trim()) {
    throw new Error('Destination address is incomplete.');
  }
  if (!params.fromAddress.street1?.trim() || !params.fromAddress.city?.trim()
      || !params.fromAddress.state?.trim() || !params.fromAddress.zip?.trim()) {
    throw new Error('Origin address is incomplete.');
  }

  const weightUnit = params.weightUnit === 'lb' ? 'lb' : 'oz';
  const weight = params.weightValue;
  const payload = await shippoRequest('/shipments/', 'POST', {
    address_to: serializeAddress(params.toAddress),
    address_from: serializeAddress(params.fromAddress),
    parcels: [
      {
        length: String(params.lengthIn),
        width: String(params.widthIn),
        height: String(params.heightIn),
        distance_unit: 'in',
        weight: String(weight),
        mass_unit: weightUnit,
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
            ?? parseOptionalString(rate?.servicelevel?.token),
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
      .map((rate: any) => ({
        ...rate,
        service: rate.service as string,
      }))
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
  const rateShipmentId = parseOptionalString(payload?.rate?.shipment);
  const transactionShipmentObjectId = parseOptionalString(payload?.shipment?.object_id);
  const transactionShipmentId = parseOptionalString(payload?.shipment);
  const responseShipmentId = rateShipmentId
    ?? transactionShipmentObjectId
    ?? transactionShipmentId;
  if (responseShipmentId && responseShipmentId !== params.shipmentId) {
    console.warn('[shipping] Shippo transaction returned mismatched shipment id', {
      expected: params.shipmentId,
      received: responseShipmentId,
    });
  }

  return {
    shipmentId: responseShipmentId ?? params.shipmentId,
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
