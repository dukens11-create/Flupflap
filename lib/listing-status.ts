export const PUBLIC_PRODUCT_STATUSES = ['APPROVED', 'ACTIVE'] as const;

export function isPublicProductStatus(status: string | null | undefined) {
  return status === 'APPROVED' || status === 'ACTIVE';
}

export function toSellerLifecycleStatus(status: string): 'DRAFT' | 'SCHEDULED' | 'ACTIVE' | 'SOLD' | 'ARCHIVED' {
  if (status === 'SCHEDULED') return 'SCHEDULED';
  if (status === 'ACTIVE' || status === 'APPROVED') return 'ACTIVE';
  if (status === 'SOLD') return 'SOLD';
  if (status === 'ARCHIVED' || status === 'HIDDEN') return 'ARCHIVED';
  return 'DRAFT';
}
