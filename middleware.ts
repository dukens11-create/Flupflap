import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(req: NextRequest) {
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
  matcher: ['/account/:path*', '/orders/:path*', '/checkout/:path*', '/seller/:path*', '/admin/:path*'],
};
