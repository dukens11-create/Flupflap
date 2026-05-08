const FREE_PROMOTION_WINDOW_DAYS = 60;

export function getFreePromotionExpiry(fromDate = new Date()): Date {
  return new Date(fromDate.getTime() + FREE_PROMOTION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

export function isFreePromotionEligible(user: {
  freePromotionGrantedAt?: Date | null;
  freePromotionExpiresAt?: Date | null;
}): boolean {
  if (!user.freePromotionGrantedAt || !user.freePromotionExpiresAt) return false;
  return user.freePromotionExpiresAt.getTime() > Date.now();
}

export function getFreePromotionWindowLabel(): string {
  return '2 months';
}
