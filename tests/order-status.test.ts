import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOrderStatus,
  isDeprecatedOrderStatus,
  isValidOrderTransition,
  ORDER_STATUS_TRANSITIONS,
  DEPRECATED_ORDER_STATUSES,
  DEPRECATED_STATUS_NORMALIZATIONS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_BADGE_CLASSES,
  getOrderStatusBadgeClass,
} from '@/lib/order-status';
import { isOrderRefundEligible } from '@/lib/refunds';

// ── normalizeOrderStatus ──────────────────────────────────────────────────────

test('normalizeOrderStatus: READY_FOR_PICKUP normalizes to PAID', () => {
  assert.equal(normalizeOrderStatus('READY_FOR_PICKUP'), 'PAID');
});

test('normalizeOrderStatus: CANCELLED normalizes to REFUNDED', () => {
  assert.equal(normalizeOrderStatus('CANCELLED'), 'REFUNDED');
});

test('normalizeOrderStatus: active statuses pass through unchanged', () => {
  const actives = Object.keys(ORDER_STATUS_TRANSITIONS);
  for (const s of actives) {
    assert.equal(normalizeOrderStatus(s), s, `Expected ${s} to pass through unchanged`);
  }
});

// ── isDeprecatedOrderStatus ───────────────────────────────────────────────────

test('isDeprecatedOrderStatus: returns true for deprecated states', () => {
  assert.equal(isDeprecatedOrderStatus('READY_FOR_PICKUP'), true);
  assert.equal(isDeprecatedOrderStatus('CANCELLED'), true);
});

test('isDeprecatedOrderStatus: returns false for active states', () => {
  assert.equal(isDeprecatedOrderStatus('PAID'), false);
  assert.equal(isDeprecatedOrderStatus('SHIPPED'), false);
  assert.equal(isDeprecatedOrderStatus('DELIVERED'), false);
});

// ── isValidOrderTransition ───────────────────────────────────────────────────

test('valid transition: PENDING → PAID', () => {
  assert.equal(isValidOrderTransition('PENDING', 'PAID'), true);
});

test('valid transition: PAID → SHIPPED (non-pickup)', () => {
  assert.equal(isValidOrderTransition('PAID', 'SHIPPED'), true);
});

test('valid transition: PAID → PICKED_UP (pickup)', () => {
  assert.equal(isValidOrderTransition('PAID', 'PICKED_UP'), true);
});

test('valid transition: PAID → REFUND_REQUESTED', () => {
  assert.equal(isValidOrderTransition('PAID', 'REFUND_REQUESTED'), true);
});

test('valid transition: SHIPPED → DELIVERED', () => {
  assert.equal(isValidOrderTransition('SHIPPED', 'DELIVERED'), true);
});

test('valid transition: SHIPPED → REFUND_REQUESTED', () => {
  assert.equal(isValidOrderTransition('SHIPPED', 'REFUND_REQUESTED'), true);
});

test('valid transition: DELIVERED → REFUND_REQUESTED', () => {
  assert.equal(isValidOrderTransition('DELIVERED', 'REFUND_REQUESTED'), true);
});

test('valid transition: PICKED_UP → REFUND_REQUESTED', () => {
  assert.equal(isValidOrderTransition('PICKED_UP', 'REFUND_REQUESTED'), true);
});

test('valid transition: REFUND_REQUESTED → REFUNDED', () => {
  assert.equal(isValidOrderTransition('REFUND_REQUESTED', 'REFUNDED'), true);
});

test('valid transition: REFUND_REQUESTED → PARTIALLY_REFUNDED', () => {
  assert.equal(isValidOrderTransition('REFUND_REQUESTED', 'PARTIALLY_REFUNDED'), true);
});

test('valid transition: PARTIALLY_REFUNDED → REFUND_REQUESTED', () => {
  assert.equal(isValidOrderTransition('PARTIALLY_REFUNDED', 'REFUND_REQUESTED'), true);
});

// ── Illegal transitions ───────────────────────────────────────────────────────

test('invalid transition: PENDING → SHIPPED (skipping PAID)', () => {
  assert.equal(isValidOrderTransition('PENDING', 'SHIPPED'), false);
});

test('invalid transition: DELIVERED → PAID (no backward transitions)', () => {
  assert.equal(isValidOrderTransition('DELIVERED', 'PAID'), false);
});

test('invalid transition: REFUNDED → PAID (terminal state)', () => {
  assert.equal(isValidOrderTransition('REFUNDED', 'PAID'), false);
});

test('invalid transition: REFUNDED → REFUND_REQUESTED (terminal state)', () => {
  assert.equal(isValidOrderTransition('REFUNDED', 'REFUND_REQUESTED'), false);
});

test('invalid transition: PICKED_UP → DELIVERED (wrong branch)', () => {
  assert.equal(isValidOrderTransition('PICKED_UP', 'DELIVERED'), false);
});

test('invalid transition: SHIPPED → PICKED_UP (wrong branch)', () => {
  assert.equal(isValidOrderTransition('SHIPPED', 'PICKED_UP'), false);
});

// ── Deprecated status backward compatibility ──────────────────────────────────

test('deprecated READY_FOR_PICKUP can transition to PICKED_UP (via normalization)', () => {
  // A legacy record with READY_FOR_PICKUP normalizes to PAID, which allows PICKED_UP.
  assert.equal(isValidOrderTransition('READY_FOR_PICKUP', 'PICKED_UP'), true);
});

test('deprecated READY_FOR_PICKUP can transition to REFUND_REQUESTED (via normalization)', () => {
  assert.equal(isValidOrderTransition('READY_FOR_PICKUP', 'REFUND_REQUESTED'), true);
});

test('deprecated CANCELLED cannot transition anywhere (normalizes to terminal REFUNDED)', () => {
  assert.equal(isValidOrderTransition('CANCELLED', 'PAID'), false);
  assert.equal(isValidOrderTransition('CANCELLED', 'SHIPPED'), false);
  assert.equal(isValidOrderTransition('CANCELLED', 'REFUND_REQUESTED'), false);
});

test('all deprecated statuses are covered by DEPRECATED_STATUS_NORMALIZATIONS', () => {
  for (const dep of DEPRECATED_ORDER_STATUSES) {
    assert.ok(
      dep in DEPRECATED_STATUS_NORMALIZATIONS,
      `${dep} should have a normalization entry`,
    );
  }
});

// ── REFUNDED is a terminal state (no outbound transitions) ────────────────────

test('REFUNDED has no allowed outbound transitions', () => {
  assert.deepEqual(ORDER_STATUS_TRANSITIONS.REFUNDED, []);
});

// ── Display helpers ───────────────────────────────────────────────────────────

test('ORDER_STATUS_LABELS covers all active statuses', () => {
  const actives = Object.keys(ORDER_STATUS_TRANSITIONS);
  for (const s of actives) {
    assert.ok(s in ORDER_STATUS_LABELS, `${s} should have a label`);
  }
});

test('ORDER_STATUS_LABELS covers deprecated statuses for legacy display', () => {
  for (const dep of DEPRECATED_ORDER_STATUSES) {
    assert.ok(dep in ORDER_STATUS_LABELS, `${dep} should have a display label`);
  }
});

test('ORDER_STATUS_BADGE_CLASSES covers all active statuses', () => {
  const actives = Object.keys(ORDER_STATUS_TRANSITIONS);
  for (const s of actives) {
    assert.ok(s in ORDER_STATUS_BADGE_CLASSES, `${s} should have a badge class`);
  }
});

test('ORDER_STATUS_BADGE_CLASSES covers deprecated statuses for legacy display', () => {
  for (const dep of DEPRECATED_ORDER_STATUSES) {
    assert.ok(dep in ORDER_STATUS_BADGE_CLASSES, `${dep} should have a badge class`);
  }
});

test('getOrderStatusBadgeClass: returns the correct class for known statuses', () => {
  assert.equal(getOrderStatusBadgeClass('PAID'), 'badge-blue');
  assert.equal(getOrderStatusBadgeClass('SHIPPED'), 'badge-green');
  assert.equal(getOrderStatusBadgeClass('CANCELLED'), 'badge-red');
});

test('getOrderStatusBadgeClass: falls back to badge-slate for unknown status', () => {
  assert.equal(getOrderStatusBadgeClass('UNKNOWN_STATUS'), 'badge-slate');
});

// ── Refund eligibility backward compatibility ─────────────────────────────────

test('isOrderRefundEligible: active refund-eligible statuses', () => {
  assert.equal(isOrderRefundEligible('PAID'), true);
  assert.equal(isOrderRefundEligible('SHIPPED'), true);
  assert.equal(isOrderRefundEligible('DELIVERED'), true);
  assert.equal(isOrderRefundEligible('PICKED_UP'), true);
  assert.equal(isOrderRefundEligible('PARTIALLY_REFUNDED'), true);
});

test('isOrderRefundEligible: non-eligible active statuses', () => {
  assert.equal(isOrderRefundEligible('PENDING'), false);
  assert.equal(isOrderRefundEligible('REFUND_REQUESTED'), false);
  assert.equal(isOrderRefundEligible('REFUNDED'), false);
});

test('isOrderRefundEligible: legacy READY_FOR_PICKUP is eligible (normalizes to PAID)', () => {
  assert.equal(isOrderRefundEligible('READY_FOR_PICKUP'), true);
});

test('isOrderRefundEligible: legacy CANCELLED is not eligible (normalizes to REFUNDED)', () => {
  assert.equal(isOrderRefundEligible('CANCELLED'), false);
});
