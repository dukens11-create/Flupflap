export const SHIPPING_MODES = ['FLAT', 'FREE', 'CALCULATED'] as const;
export type ShippingMode = typeof SHIPPING_MODES[number];
