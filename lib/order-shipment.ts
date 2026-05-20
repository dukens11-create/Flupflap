/**
 * Pure helpers for per-seller shipment tracking in multi-seller orders.
 *
 * The OrderShipment model stores one row per seller per order so that each
 * seller's label/tracking state is tracked independently. The helpers below
 * are intentionally side-effect-free so they can be used in both server
 * routes and tests without a database connection.
 */

export type ShipmentRecord = {
  shipmentStatus?: string | null;
  labelUrl?: string | null;
  trackingNumber?: string | null;
};

/**
 * Returns true if this shipment record represents a completed shipment
 * (label purchased, tracking available, or manually marked as shipped).
 */
export function isShipmentShipped(shipment: ShipmentRecord): boolean {
  const status = (shipment.shipmentStatus ?? '').toUpperCase();
  const hasArtifacts = !!(shipment.labelUrl || shipment.trackingNumber);
  return (
    hasArtifacts ||
    status === 'LABEL_PURCHASED' ||
    status === 'PURCHASED' ||
    status === 'SHIPPED_MANUAL'
  );
}

/**
 * Given the seller IDs that are expected to ship and the seller IDs whose
 * OrderShipment records are in a shipped state, returns true only when every
 * seller in `shippingSellerIds` has a matching shipped entry.
 *
 * Returns false when `shippingSellerIds` is empty to avoid incorrectly
 * marking no-shipment orders as shipped.
 */
export function allSellersShipped(
  shippingSellerIds: string[],
  shippedSellerIds: string[],
): boolean {
  if (shippingSellerIds.length === 0) return false;
  const shippedSet = new Set(shippedSellerIds);
  return shippingSellerIds.every((id) => shippedSet.has(id));
}

/**
 * Returns the unique seller IDs found in an array of order items. Pass the
 * full items list for an order; the caller is responsible for pre-filtering
 * out pickup-only items if needed.
 */
export function distinctSellerIds(
  items: { product: { sellerId: string } }[],
): string[] {
  return [...new Set(items.map((item) => item.product.sellerId))];
}
