export const REVIEWABLE_ORDER_STATUSES = ['DELIVERED', 'PICKED_UP'] as const;
export const COMPLAINT_ELIGIBLE_ORDER_STATUSES = [
  'PAID',
  'SHIPPED',
  'DELIVERED',
  'READY_FOR_PICKUP',
  'PICKED_UP',
  'REFUNDED',
] as const;
export const REVIEW_COMMENT_MIN_LENGTH = 3;
export const COMPLAINT_DESCRIPTION_MIN_LENGTH = 5;
export const FEEDBACK_TEXT_MAX_LENGTH = 2000;

export const COMPLAINT_CATEGORIES = [
  'item_not_as_described',
  'damaged_item',
  'counterfeit_item',
  'seller_harassment',
  'late_shipment',
  'missing_item',
  'refund_issue',
  'prohibited_item',
  'fraud_scam',
  'other',
] as const;

export const COMPLAINT_CATEGORY_LABELS: Record<(typeof COMPLAINT_CATEGORIES)[number], string> = {
  item_not_as_described: 'Item not as described',
  damaged_item: 'Damaged item',
  counterfeit_item: 'Counterfeit item',
  seller_harassment: 'Seller harassment',
  late_shipment: 'Late shipment',
  missing_item: 'Missing item',
  refund_issue: 'Refund issue',
  prohibited_item: 'Prohibited item',
  fraud_scam: 'Fraud / scam',
  other: 'Other',
};
