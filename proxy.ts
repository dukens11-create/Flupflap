import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Check whether a JWT token carries the given role.
 * Prefers the `roles` array (multi-role); falls back to the legacy `role` field
 * for tokens issued before the multi-role feature was deployed.
 */
function tokenHasRole(token: { role?: unknown; roles?: unknown } | null, role: string): boolean {
  if (!token) return false;
  const roles = Array.isArray(token.roles) && token.roles.length > 0 ? token.roles : null;
  if (roles) return roles.includes(role);
  return token.role === role;
}

export async function proxy(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  // Routes that require any authenticated user
  const authRequired = ['/account', '/orders', '/checkout'];
  // Routes that require SELLER role
  const sellerRequired = ['/seller'];
  // Routes that require ADMIN role
  const adminRequired = ['/admin'];

  const needsAuth = authRequired.some(p => pathname === p || pathname.startsWith(p + '/'));
  const needsSeller = sellerRequired.some(p => pathname === p || pathname.startsWith(p + '/'));
  const needsAdmin = adminRequired.some(p => pathname === p || pathname.startsWith(p + '/'));

  // Not logged in → redirect to login (preserving destination)
  if ((needsAuth || needsSeller || needsAdmin) && !token) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Logged in but missing required role → redirect to home
  if (needsSeller && !tokenHasRole(token, 'SELLER')) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (needsAdmin && !tokenHasRole(token, 'ADMIN')) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/account/:path*', '/orders/:path*', '/checkout/:path*', '/seller/:path*', '/admin/:path*'],
};
