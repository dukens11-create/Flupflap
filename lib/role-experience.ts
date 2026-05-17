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
  const defaultPath = experienceRole === 'admin' ? '/admin/dashboard' : '/';
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
  children?: RoleNavItem[];
  matchPrefixes?: string[];
};

const buyerNav: RoleNavItem[] = [
  { label: 'Browse', href: '/' },
  { label: 'Garage Sales', href: '/garage-sales' },
  { label: 'Orders', href: '/orders' },
  { label: 'Account', href: '/account' },
];

const sellerNav: RoleNavItem[] = [
  { label: 'Seller Dashboard', href: '/seller/dashboard' },
  { label: 'Garage Sales', href: '/seller/garage-sales' },
  {
    label: 'My Listings',
    href: '/seller/listings',
    matchPrefixes: ['/seller/listings'],
    children: [
      { label: 'List Item', href: '/seller/listings/new' },
      { label: 'Drafts', href: '/seller/listings/drafts' },
      { label: 'Scheduled', href: '/seller/listings/scheduled' },
      { label: 'Active', href: '/seller/listings/active' },
      { label: 'Sold', href: '/seller/listings/sold' },
      { label: 'Archived', href: '/seller/listings/archived' },
    ],
  },
  { label: 'Sales', href: '/seller/sales' },
  { label: 'Orders to Ship', href: '/seller/orders-to-ship' },
  { label: 'Payouts', href: '/seller/payouts' },
  { label: 'Promotions', href: '/seller/promotions' },
  { label: 'Verification Status', href: '/seller/verification-status' },
  { label: 'Shop by Culture', href: '/seller/shop-by-culture' },
];

const adminNav: RoleNavItem[] = [
  { label: 'Dashboard', href: '/admin/dashboard' },
  { label: 'Users', href: '/admin/users' },
  { label: 'Sellers', href: '/admin/sellers' },
  { label: 'Products', href: '/admin#products-panel' },
  { label: 'Garage Sales', href: '/admin/garage-sales' },
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
  return [{ label: 'Browse', href: '/' }, { label: 'Garage Sales', href: '/garage-sales' }];
}

function isRoleNavItemActiveInternal(
  item: RoleNavItem,
  pathname: string | null | undefined,
  visited: Set<RoleNavItem>,
): boolean {
  if (!pathname) return false;
  if (visited.has(item)) return false;
  visited.add(item);
  if (item.matchPrefixes?.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return true;
  }
  if (item.href) {
    const hrefPath = item.href.split('#')[0];
    if (pathname === hrefPath) return true;
  }
  return item.children?.some((child) => isRoleNavItemActiveInternal(child, pathname, visited)) ?? false;
}

export function isRoleNavItemActive(
  item: RoleNavItem,
  pathname?: string | null,
  visited: Set<RoleNavItem> = new Set(),
): boolean {
  return isRoleNavItemActiveInternal(item, pathname, visited);
}
