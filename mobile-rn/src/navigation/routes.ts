/**
 * Route name constants for the FlupFlap RN app.
 * Import from here rather than using raw string literals to get
 * compile-time typo protection.
 */

export const Routes = {
  // Auth
  Login: 'Login',

  // Seller
  SellerDashboard: 'SellerDashboard',
  SellerNotifications: 'SellerNotifications',
  SellerOrderDetail: 'SellerOrderDetail',
} as const;

export type RouteName = (typeof Routes)[keyof typeof Routes];
