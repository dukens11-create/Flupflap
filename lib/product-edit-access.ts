import type { Role } from '@prisma/client';

type ProductEditorRole = Extract<Role, 'SELLER' | 'ADMIN'>;

export function canEditProductForSeller(
  role: ProductEditorRole,
  actorId: string | null | undefined,
  sellerId: string | null | undefined,
) {
  if (!actorId || !sellerId) return false;
  return role === 'ADMIN' || actorId === sellerId;
}

export function getProductEditCancelPath(role: ProductEditorRole) {
  return role === 'ADMIN' ? '/admin' : '/seller';
}

export function getProductEditDraftPath(role: ProductEditorRole) {
  return role === 'ADMIN' ? '/admin' : '/seller?updated=1';
}

export function getProductEditSuccessPath(
  role: ProductEditorRole,
  productId: string,
  fraudReviewRecommended = false,
) {
  if (role === 'ADMIN') return '/admin';

  const searchParams = new URLSearchParams({ updated: productId });
  if (fraudReviewRecommended) {
    searchParams.set('fraud', 'review');
  }
  return `/seller/listings/drafts?${searchParams.toString()}`;
}

export function canDeleteProductFromEdit(role: ProductEditorRole, status: string) {
  return role === 'SELLER' && status !== 'SOLD';
}
