export function getFreePromotionExpiry(fromDate = new Date()): Date {
  const expiry = new Date(fromDate);
  expiry.setMonth(expiry.getMonth() + 2);
  return expiry;
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
