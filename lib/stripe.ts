import Stripe from 'stripe';
import { getSiteUrl } from '@/lib/seo';

let _stripe: Stripe | null = null;
export type StripeMode = 'test' | 'live';
export type StripeErrorReason =
  | 'invalid_key'
  | 'stale_account'
  | 'platform_incomplete'
  | 'stripe_error';
export const STRIPE_ERROR_REASONS: StripeErrorReason[] = [
  'invalid_key',
  'stale_account',
  'platform_incomplete',
  'stripe_error',
];

type StripeErrorShape = {
  code?: unknown;
  statusCode?: unknown;
  type?: unknown;
  message?: unknown;
};

function isStripeSecretKey(value: string): boolean {
  return value.startsWith('sk_live_') || value.startsWith('sk_test_');
}

function getStripe(): Stripe {
  if (!_stripe) {
    const key = (process.env.STRIPE_SECRET_KEY ?? '').trim();
    if (!key) {
      throw new Error('[stripe] STRIPE_SECRET_KEY is not set. Configure it before making Stripe API calls.');
    }
    if (!isStripeSecretKey(key)) {
      throw new Error('[stripe] STRIPE_SECRET_KEY is invalid. It must start with sk_live_ or sk_test_.');
    }
    _stripe = new Stripe(key, { apiVersion: '2024-06-20' as any });
  }
  return _stripe;
}

export function getCurrentStripeMode(): StripeMode | null {
  const key = process.env.STRIPE_SECRET_KEY ?? '';
  if (key.startsWith('sk_live_')) return 'live';
  if (key.startsWith('sk_test_')) return 'test';
  return null;
}

export function modeFromStripeLivemode(livemode: boolean): StripeMode {
  return livemode ? 'live' : 'test';
}

export function extractStripeResourceId(value: string | { id: string } | null | undefined): string | null {
  return typeof value === 'string' ? value : value?.id ?? null;
}

export function classifyStripeError(err: unknown): {
  reason: StripeErrorReason;
  message: string;
  code?: string;
  statusCode?: number;
} {
  const e = (typeof err === 'object' && err !== null ? err : {}) as StripeErrorShape;
  const code = typeof e.code === 'string' ? e.code : undefined;
  const statusCode = typeof e.statusCode === 'number' ? e.statusCode : undefined;
  const type = typeof e.type === 'string' ? e.type : '';
  const message = typeof e.message === 'string' ? e.message : 'Stripe request failed.';

  if (
    type === 'StripeAuthenticationError'
    || code === 'api_key_expired'
    || /invalid api key/i.test(message)
    || /provided api key/i.test(message)
    || /STRIPE_SECRET_KEY .* not set/i.test(message)
    || /STRIPE_SECRET_KEY .* invalid/i.test(message)
  ) {
    return { reason: 'invalid_key', message, code, statusCode };
  }

  if (
    code === 'account_invalid'
    || statusCode === 404
    || /no such account/i.test(message)
    || /not connected to your platform/i.test(message)
  ) {
    return { reason: 'stale_account', message, code, statusCode };
  }

  if (
    /responsib(?:le|ility).*(?:loss|negative balance)/i.test(message)
    || /managing losses for connected accounts/i.test(message)
    || /platform profile/i.test(message)
    || /connect platform/i.test(message)
  ) {
    return { reason: 'platform_incomplete', message, code, statusCode };
  }

  return { reason: 'stripe_error', message, code, statusCode };
}

// Lazily-initialized singleton — does NOT construct the Stripe client until the
// first property access. This prevents the build from failing when
// STRIPE_SECRET_KEY is only available at runtime.
export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop: string | symbol) {
    const s = getStripe();
    const value = (s as any)[prop];
    return typeof value === 'function' ? value.bind(s) : value;
  },
  has(_target, prop: string | symbol) {
    return prop in getStripe();
  },
  ownKeys(_target) {
    return Reflect.ownKeys(getStripe());
  },
  getOwnPropertyDescriptor(_target, prop: string | symbol) {
    return Reflect.getOwnPropertyDescriptor(getStripe(), prop);
  },
});

export const appUrl = getSiteUrl().toString().replace(/\/$/, '');
