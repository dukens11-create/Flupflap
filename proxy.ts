import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

function toHostname(hostOrHostPort: string) {
  try {
    return new URL(`http://${hostOrHostPort}`).hostname.toLowerCase();
  } catch {
    return hostOrHostPort.toLowerCase();
  }
}

function getConfiguredAuthOrigin() {
  const raw = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      host: url.host.toLowerCase(),
      hostname: url.hostname.toLowerCase(),
      protocol: url.protocol,
    };
  } catch {
    return null;
  }
}

function isWwwVariant(a: string, b: string) {
  const hostA = toHostname(a);
  const hostB = toHostname(b);
  return hostA === hostB || hostA === `www.${hostB}` || hostB === `www.${hostA}`;
}

export async function proxy(req: NextRequest) {
  // Keep auth/login traffic on a single configured host to avoid cross-domain
  // session cookie and CSRF issues when users mix www and non-www URLs.
  const configuredOrigin = getConfiguredAuthOrigin();
  const incomingHostWithPort = req.nextUrl.host;
  if (
    configuredOrigin &&
    incomingHostWithPort &&
    isWwwVariant(incomingHostWithPort, configuredOrigin.host) &&
    toHostname(incomingHostWithPort) !== configuredOrigin.hostname
  ) {
    const canonical = req.nextUrl.clone();
    canonical.host = configuredOrigin.host;
    canonical.protocol = configuredOrigin.protocol;
    return NextResponse.redirect(canonical);
  }

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

  // Logged in but wrong role → redirect to home
  if (needsSeller && token?.role !== 'SELLER') {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (needsAdmin && token?.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/api/auth/:path*',
    '/account/:path*',
    '/orders/:path*',
    '/checkout/:path*',
    '/seller/:path*',
    '/admin/:path*',
  ],
};
