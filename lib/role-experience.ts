export type ExperienceRole = 'buyer' | 'seller' | 'admin' | 'guest';

export function normalizeExperienceRole(role?: string | null): ExperienceRole {
  if (!role) return 'guest';
  const normalized = role.toUpperCase();
  if (normalized === 'ADMIN') return 'admin';
  if (normalized === 'SELLER') return 'seller';
  if (normalized === 'CUSTOMER' || normalized === 'BUYER') return 'buyer';
  return 'guest';
}

export function getRoleDefaultPath(role?: string | null): string {
  const experienceRole = normalizeExperienceRole(role);
  if (experienceRole === 'admin') return '/admin/dashboard';
  if (experienceRole === 'seller') return '/';
  if (experienceRole === 'buyer') return '/';
  return '/';
}

export function resolveRoleLoginDestination(role: string | null | undefined, callbackUrl: string | null): string {
  const experienceRole = normalizeExperienceRole(role);
  const defaultPath = getRoleDefaultPath(role);
  if (!callbackUrl) return defaultPath;
  if (!callbackUrl.startsWith('/') || callbackUrl.startsWith('//')) return defaultPath;
  if (callbackUrl === '/login' || callbackUrl.startsWith('/login?')) return defaultPath;
  if (callbackUrl === '/signup' || callbackUrl.startsWith('/signup?')) return defaultPath;
  if (callbackUrl === '/forgot-password' || callbackUrl.startsWith('/forgot-password?')) return defaultPath;
  if (callbackUrl === '/reset-password' || callbackUrl.startsWith('/reset-password?')) return defaultPath;
  if (experienceRole !== 'admin' && (callbackUrl === '/admin' || callbackUrl.startsWith('/admin/'))) {
    return defaultPath;
  }
  return callbackUrl;
}

export type RoleNavItem = {
  label: string;
  href: string;
};

const buyerNav: RoleNavItem[] = [
  { label: 'Browse', href: '/' },
  { label: 'Cart', href: '/cart' },
  { label: 'Orders', href: '/orders' },
  { label: 'Messages', href: '/messages' },
  { label: 'Notifications', href: '/notifications' },
  { label: 'Account', href: '/account' },
];

const sellerNav: RoleNavItem[] = [
  { label: 'Seller Dashboard', href: '/seller/dashboard' },
  { label: 'List Item', href: '/seller/new' },
  { label: 'My Listings', href: '/seller#my-listings' },
  { label: 'Sales', href: '/seller#sales-overview' },
  { label: 'Orders to Ship', href: '/seller#orders-to-ship' },
  { label: 'Payouts', href: '/seller#payouts' },
  { label: 'Promotions', href: '/seller#promotion-status' },
  { label: 'Verification Status', href: '/seller#verification-status' },
  { label: 'Messages', href: '/messages' },
];

const adminNav: RoleNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Sellers', href: '/admin/sellers' },
  { label: 'Products', href: '/admin#products-panel' },
  { label: 'Orders', href: '/admin#orders-panel' },
  { label: 'Payments', href: '/admin#payments-panel' },
  { label: 'Reports', href: '/admin/reports' },
  { label: 'Fraud', href: '/admin/fraud' },
  { label: 'Promotions', href: '/admin/promotions' },
  { label: 'KYC', href: '/admin/sellers#kyc-verification' },
  { label: 'Settings', href: '/admin#site-settings' },
];

export function getRoleNavigation(role?: string | null): RoleNavItem[] {
  const experienceRole = normalizeExperienceRole(role);
  if (experienceRole === 'admin') return adminNav;
  if (experienceRole === 'seller') return sellerNav;
  if (experienceRole === 'buyer') return buyerNav;
  return [{ label: 'Browse', href: '/' }];
}
