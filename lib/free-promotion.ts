export function isFreePromotionEligible(user: {
  hasFreePromotion?: boolean | null;
  freePromotionStart?: Date | null;
  freePromotionEnd?: Date | null;
  freePromotionGrantedAt?: Date | null;
  freePromotionExpiresAt?: Date | null;
}): boolean {
  const hasFreePromotion = user.hasFreePromotion ?? true;
  const freePromotionStart = user.freePromotionStart ?? user.freePromotionGrantedAt;
  const freePromotionEnd = user.freePromotionEnd ?? user.freePromotionExpiresAt;
  if (!hasFreePromotion || !freePromotionStart || !freePromotionEnd) return false;
  const now = Date.now();
  return freePromotionStart.getTime() <= now && freePromotionEnd.getTime() > now;
}

export function getFreePromotionDaysLeft(user: {
  freePromotionEnd?: Date | null;
  freePromotionExpiresAt?: Date | null;
}) {
  const end = user.freePromotionEnd ?? user.freePromotionExpiresAt;
  if (!end) return 0;
  return Math.max(0, Math.ceil((end.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}
