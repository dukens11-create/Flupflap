import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  hasStoredPackageDetails,
  SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE,
} from '@/lib/product-package';

/**
 * Sanitise the redirectTo value coming from form input.
 * Only allow simple relative paths under /admin to prevent open redirects and path traversal.
 */
function safeAdminRedirect(raw: string | null, fallback = '/admin'): string {
  if (!raw) return fallback;
  // Reject protocol-relative (//evil.com) and absolute URLs (https://...)
  if (raw.startsWith('//') || raw.includes('://')) return fallback;
  // Normalise the path to resolve any traversal sequences like ../
  // new URL resolves /admin/../../etc to /etc so we re-check after normalisation.
  try {
    const normalized = new URL(raw, 'https://placeholder.invalid').pathname;
    if (!normalized.startsWith('/admin')) return fallback;
    return normalized;
  } catch {
    return fallback;
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  try {
    const form = await req.formData();
    const action = form.get('_method') as string;
    const redirectTo = safeAdminRedirect(form.get('redirectTo') as string | null);
    const actionToStatus: Record<string, 'APPROVED' | 'REJECTED' | 'HIDDEN'> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      hide: 'HIDDEN',
    };

    if (action !== 'approve' && action !== 'reject' && action !== 'hide') {
      const errUrl = new URL(redirectTo, req.url);
      errUrl.searchParams.set('error', 'Invalid action.');
      return NextResponse.redirect(errUrl, 302);
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) {
      const errUrl = new URL(redirectTo, req.url);
      errUrl.searchParams.set('error', 'Listing not found.');
      return NextResponse.redirect(errUrl, 302);
    }
    if (action === 'approve' && !hasStoredPackageDetails(product)) {
      const errUrl = new URL(redirectTo, req.url);
      errUrl.searchParams.set('error', SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE);
      return NextResponse.redirect(errUrl, 302);
    }

    await prisma.product.update({
      where: { id },
      data: { status: actionToStatus[action] },
    });

    // Use 302 (not 307) so the browser follows the redirect with GET, not POST.
    // Next.js page routes only handle GET; a POST redirect (307) causes a 405 crash.
    const successUrl = new URL(redirectTo, req.url);
    successUrl.searchParams.set('success', `Listing ${action}d.`);
    return NextResponse.redirect(successUrl, 302);
  } catch {
    const errUrl = new URL('/admin', req.url);
    errUrl.searchParams.set('error', 'An unexpected error occurred.');
    return NextResponse.redirect(errUrl, 302);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await req.json() as { status?: unknown };
    const { status } = body;
    if (!status || !['APPROVED', 'REJECTED', 'HIDDEN'].includes(status as string)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (status === 'APPROVED' && !hasStoredPackageDetails(existing)) {
      return NextResponse.json({ error: SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: { status: status as 'APPROVED' | 'REJECTED' | 'HIDDEN' },
    });

    return NextResponse.json(product);
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    await prisma.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
