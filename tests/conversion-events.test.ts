import test from 'node:test';
import assert from 'node:assert/strict';
import { CONVERSION_EVENTS, isConversionEventName } from '@/lib/conversion-events';

test('conversion event list includes all launch-critical GA4 events', () => {
  const requiredEvents = [
    'signup_complete',
    'seller_registration_complete',
    'kyc_submitted',
    'product_published',
    'add_to_cart',
    'checkout_started',
    'purchase_completed',
    'garage_sale_promo_purchased',
  ] as const;

  for (const eventName of requiredEvents) {
    assert.equal(CONVERSION_EVENTS.includes(eventName), true, `${eventName} should be registered`);
    assert.equal(isConversionEventName(eventName), true, `${eventName} should be recognized`);
  }
});

test('conversion event guard rejects unexpected event names', () => {
  assert.equal(isConversionEventName('not_a_conversion_event'), false);
});
