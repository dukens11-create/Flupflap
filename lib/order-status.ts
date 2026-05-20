/**
 * Order Status State Machine
 *
 * Active states and valid transitions:
 *
 *   PENDING → PAID
 *   PAID → SHIPPED              (seller ships non-pickup order)
 *   PAID → PICKED_UP            (seller verifies pickup code)
 *   PAID → REFUND_REQUESTED     (buyer requests refund before shipment)
 *   SHIPPED → DELIVERED
 *   SHIPPED → REFUND_REQUESTED
 *   DELIVERED → REFUND_REQUESTED
 *   PICKED_UP → REFUND_REQUESTED
 *   PARTIALLY_REFUNDED → REFUND_REQUESTED
 *   REFUND_REQUESTED → REFUNDED
 *   REFUND_REQUESTED → PARTIALLY_REFUNDED
 *
 * DELIVERED, PICKED_UP, and REFUNDED are terminal states with no outbound
 * transitions except through the refund flow.
 *
 * ── Deprecated states ──────────────────────────────────────────────────────
 *
 * The following OrderStatus values exist in the database schema for backward
 * compatibility with any pre-existing records, but are **no longer reachable**
 * in any active code path.  No new orders will ever be written with these values.
 *
 *   READY_FOR_PICKUP
 *     Originally intended as an optional intermediate step between PAID and
 *     PICKED_UP for pickup orders (seller marks item ready before code
 *     verification). No API endpoint ever writes this value; the pickup flow
 *     goes PAID → PICKED_UP directly.
 *     Normalization: treat as PAID for all business-logic purposes.
 *
 *   CANCELLED
 *     Originally intended for orders cancelled before payment, but no API
 *     endpoint writes this value to an Order's status field.  (The
 *     SubscriptionStatus "CANCELLED" value used by the Stripe webhook is a
 *     separate field and is unrelated.)
 *     Normalization: treat as REFUNDED (terminal / no-action) for business logic.
 *
 * ── Product status: SCHEDULED ───────────────────────────────────────────────
 *
 * ProductStatus.SCHEDULED is similarly deprecated for new records: the API
 * returns an error when a seller tries to schedule a listing, and the UI no
 * longer exposes the scheduling workflow.  Pre-existing SCHEDULED records are
 * promoted to ACTIVE automatically by the publish-scheduled-listings script
 * and can be manually cancelled back to DRAFT via the CANCEL_SCHEDULE action
 * in app/api/seller/products/[id]/route.ts.
 */

// ── Active statuses ──────────────────────────────────────────────────────────

export type ActiveOrderStatus =
  | 'PENDING'
  | 'PAID'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'REFUND_REQUESTED'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'PICKED_UP';

// ── Deprecated statuses ──────────────────────────────────────────────────────

/** Statuses that exist in the schema but are no longer reachable in new flows. */
export const DEPRECATED_ORDER_STATUSES = ['READY_FOR_PICKUP', 'CANCELLED'] as const;

export type DeprecatedOrderStatus = (typeof DEPRECATED_ORDER_STATUSES)[number];

/** All order status values including deprecated ones retained for backward compat. */
export type OrderStatusValue = ActiveOrderStatus | DeprecatedOrderStatus;

/**
 * Normalization map: maps each deprecated status to its active equivalent.
 * Use this when applying transition guards or business logic to records that
 * may hold legacy values.
 */
export const DEPRECATED_STATUS_NORMALIZATIONS: Record<DeprecatedOrderStatus, ActiveOrderStatus> = {
  READY_FOR_PICKUP: 'PAID',
  CANCELLED: 'REFUNDED',
};

/**
 * Returns the active equivalent of a status, remapping deprecated values so
 * that legacy records still participate correctly in business logic.
 */
export function normalizeOrderStatus(status: string): ActiveOrderStatus {
  if (status === 'READY_FOR_PICKUP') return 'PAID';
  if (status === 'CANCELLED') return 'REFUNDED';
  return status as ActiveOrderStatus;
}

/** Returns true when the given status is a deprecated (unreachable) state. */
export function isDeprecatedOrderStatus(status: string): status is DeprecatedOrderStatus {
  return (DEPRECATED_ORDER_STATUSES as ReadonlyArray<string>).includes(status);
}

// ── Valid transition map ──────────────────────────────────────────────────────

/**
 * Allowed outbound transitions for each active status.
 * Deprecated statuses are not present as keys — callers should normalize first.
 */
export const ORDER_STATUS_TRANSITIONS: Record<ActiveOrderStatus, ReadonlyArray<ActiveOrderStatus>> = {
  PENDING: ['PAID'],
  PAID: ['SHIPPED', 'PICKED_UP', 'REFUND_REQUESTED'],
  SHIPPED: ['DELIVERED', 'REFUND_REQUESTED'],
  DELIVERED: ['REFUND_REQUESTED'],
  PICKED_UP: ['REFUND_REQUESTED'],
  REFUND_REQUESTED: ['REFUNDED', 'PARTIALLY_REFUNDED'],
  PARTIALLY_REFUNDED: ['REFUND_REQUESTED'],
  REFUNDED: [],
};

/**
 * Returns true when moving an order from `from` to `to` is a valid transition.
 *
 * Deprecated source statuses are normalized before the check so that legacy
 * records can still progress through the state machine (e.g. a legacy
 * READY_FOR_PICKUP order can be confirmed as PICKED_UP).
 */
export function isValidOrderTransition(from: string, to: string): boolean {
  const normalizedFrom = normalizeOrderStatus(from);
  const normalizedTo = normalizeOrderStatus(to);
  const allowed = ORDER_STATUS_TRANSITIONS[normalizedFrom];
  if (!allowed) return false;
  return (allowed as ReadonlyArray<string>).includes(normalizedTo);
}

// ── Display helpers ───────────────────────────────────────────────────────────

/**
 * Human-readable labels for all statuses, including deprecated ones so that
 * legacy records display sensibly.
 */
export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  PAID: 'Paid',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  REFUND_REQUESTED: 'Refund Requested',
  PARTIALLY_REFUNDED: 'Partially Refunded',
  REFUNDED: 'Refunded',
  PICKED_UP: 'Picked Up',
  // Deprecated — kept for display of any legacy records
  READY_FOR_PICKUP: 'Ready for Pickup',
  CANCELLED: 'Cancelled',
};

/**
 * Tailwind badge CSS classes for all statuses, including deprecated ones so
 * that legacy records render with an appropriate badge.
 */
export const ORDER_STATUS_BADGE_CLASSES: Record<string, string> = {
  PENDING: 'badge-yellow',
  PAID: 'badge-blue',
  SHIPPED: 'badge-green',
  DELIVERED: 'badge-green',
  REFUND_REQUESTED: 'badge-yellow',
  PARTIALLY_REFUNDED: 'badge-blue',
  REFUNDED: 'badge-slate',
  PICKED_UP: 'badge-green',
  // Deprecated — kept for display of any legacy records
  READY_FOR_PICKUP: 'badge-blue',
  CANCELLED: 'badge-red',
};
