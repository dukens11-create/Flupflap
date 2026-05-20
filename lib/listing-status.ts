export const PUBLIC_PRODUCT_STATUSES = ['APPROVED', 'ACTIVE'] as const;

export function isPublicProductStatus(status: string | null | undefined) {
  return status === 'APPROVED' || status === 'ACTIVE';
}

/**
 * Maps a raw ProductStatus value to the seller-facing lifecycle label used
 * throughout the UI.
 *
 * NOTE — SCHEDULED is a deprecated status: new listings can no longer be
 * scheduled (the API rejects scheduling requests). Pre-existing SCHEDULED
 * records are auto-promoted to ACTIVE by the publish-scheduled-listings script
 * and can be manually cancelled back to DRAFT via the CANCEL_SCHEDULE workflow
 * action. This function retains handling for SCHEDULED so that any remaining
 * legacy records display correctly until they are promoted or cancelled.
 */
export function toSellerLifecycleStatus(status: string): 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'SOLD' | 'ARCHIVED' {
  if (status === 'SCHEDULED') return 'SCHEDULED';
  if (status === 'ACTIVE' || status === 'APPROVED') return 'ACTIVE';
  if (status === 'SOLD') return 'SOLD';
  if (status === 'ARCHIVED' || status === 'HIDDEN') return 'ARCHIVED';
  return 'DRAFT';
}
