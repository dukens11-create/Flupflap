import Stripe from 'stripe';

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error('[stripe] STRIPE_SECRET_KEY is not set. Configure it before making Stripe API calls.');
    }
    _stripe = new Stripe(key, { apiVersion: '2024-06-20' as any });
  }
  return _stripe;
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

export const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000';
