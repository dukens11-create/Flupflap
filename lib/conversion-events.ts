export const CONVERSION_EVENTS = [
  'signup_complete',
  'seller_registration_complete',
  'kyc_submitted',
  'product_published',
  'add_to_cart',
  'checkout_started',
  'purchase_completed',
  'garage_sale_promo_purchased',
] as const;

export type ConversionEventName = (typeof CONVERSION_EVENTS)[number];

const CONVERSION_EVENT_SET = new Set<string>(CONVERSION_EVENTS);

export function isConversionEventName(value: string): value is ConversionEventName {
  return CONVERSION_EVENT_SET.has(value);
}
