type ReloadlyTokenResponse = {
  access_token: string;
  expires_in?: number;
};

type ReloadlyTopupResponse = {
  transactionId?: number | string;
  status?: string;
  balanceInfo?: {
    cost?: number;
    currencyCode?: string;
  };
  [key: string]: unknown;
};

let cachedToken: { value: string; expiresAt: number; audience: string } | null = null;

function config() {
  const clientId = process.env.RELOADLY_CLIENT_ID?.trim();
  const clientSecret = process.env.RELOADLY_CLIENT_SECRET?.trim();
  const mode = (process.env.RELOADLY_MODE ?? 'sandbox').trim().toLowerCase();
  const baseUrl = mode === 'live' ? 'https://topups.reloadly.com' : 'https://topups-sandbox.reloadly.com';
  if (!clientId || !clientSecret) {
    throw new Error('Reloadly airtime credentials are not configured');
  }
  return { clientId, clientSecret, baseUrl, mode };
}

async function accessToken(): Promise<string> {
  const { clientId, clientSecret, baseUrl } = config();
  const now = Date.now();
  if (cachedToken && cachedToken.audience === baseUrl && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.value;
  }
  const response = await fetch('https://auth.reloadly.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      audience: baseUrl,
    }),
  });
  const data = await response.json().catch(() => ({})) as Partial<ReloadlyTokenResponse> & { message?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.message || 'Reloadly authentication failed');
  }
  const ttlSeconds = Math.max(300, Number(data.expires_in ?? 3600));
  cachedToken = { value: data.access_token, expiresAt: now + ttlSeconds * 1000, audience: baseUrl };
  return data.access_token;
}

export async function sendReloadlyTopup(input: {
  operatorId: number;
  amountCents: number;
  recipientCountryCode: string;
  recipientPhone: string;
  customIdentifier: string;
}) {
  const { baseUrl } = config();
  const token = await accessToken();
  const response = await fetch(baseUrl + '/topups', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/com.reloadly.topups-v1+json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      operatorId: input.operatorId,
      amount: input.amountCents / 100,
      useLocalAmount: false,
      customIdentifier: input.customIdentifier,
      recipientPhone: {
        countryCode: input.recipientCountryCode,
        number: input.recipientPhone.replace(/\D/g, ''),
      },
    }),
  });
  const data = await response.json().catch(() => ({})) as ReloadlyTopupResponse & {
    errorCode?: string;
    message?: string;
  };
  if (!response.ok) {
    const error = new Error(data.message || 'Reloadly top-up failed') as Error & { code?: string; payload?: unknown };
    error.code = data.errorCode || 'RELOADLY_TOPUP_FAILED';
    error.payload = data;
    throw error;
  }
  return data;
}
