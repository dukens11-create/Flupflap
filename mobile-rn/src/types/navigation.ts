/**
 * React Navigation type declarations for the FlupFlap RN app.
 *
 * Keeping param lists in one file ensures screens stay in sync with
 * each other and with the navigator definitions.
 */

/**
 * Root stack navigator param list.
 * Login is the auth gate; Seller* screens are accessible once authenticated.
 */
export type RootStackParamList = {
  Login: undefined;
  SellerDashboard: undefined;
  SellerNotifications: undefined;
  SellerOrderDetail: {orderId: string};
};

/** Seller-specific sub-stack param list (nested inside RootStack). */
export type SellerStackParamList = {
  SellerDashboard: undefined;
  SellerNotifications: undefined;
  SellerOrderDetail: {orderId: string};
};
