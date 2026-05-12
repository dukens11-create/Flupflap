import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  hasStoredPackageDetails,
  SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE,
} from '@/lib/product-package';

function isJsonRequest(req: Request) {
  return (req.headers.get('accept') ?? '').includes('application/json');
}

const ALLOWED_REDIRECT_PATHS = new Set(['/admin', '/admin/fraud']);

function resolveRedirectPath(redirectTo: string | null | undefined) {
  if (!redirectTo || !ALLOWED_REDIRECT_PATHS.has(redirectTo)) return '/admin';
  return redirectTo;
}

function redirectWithMessage(req: Request, redirectTo: string, key: 'error' | 'success', message: string) {
  const url = new URL(resolveRedirectPath(redirectTo), req.url);
  url.searchParams.set(key, message);
  return NextResponse.redirect(url, 303);
}

function respondError(req: Request, message: string, status: number, redirectTo = '/admin') {
  if (isJsonRequest(req)) {
    return NextResponse.json({ error: message }, { status });
  }
  return redirectWithMessage(req, redirectTo, 'error', message);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return respondError(req, 'Forbidden', 403);
    }

    const { id } = await params;
    const form = await req.formData();
    const action = form.get('_method') as string;
    const redirectTo = resolveRedirectPath(form.get('redirectTo') as string);
    const actionToStatus: Record<string, 'APPROVED' | 'REJECTED' | 'HIDDEN'> = {
      approve: 'APPROVED',
      reject: 'REJECTED',
      hide: 'HIDDEN',
    };

    if (action !== 'approve' && action !== 'reject' && action !== 'hide') {
      return respondError(req, 'Invalid action.', 400, redirectTo);
    }

    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return respondError(req, 'Not found.', 404, redirectTo);
    if (action === 'approve' && !hasStoredPackageDetails(product)) {
      return respondError(req, SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE, 400, redirectTo);
    }

    await prisma.product.update({
      where: { id },
      data: { status: actionToStatus[action] },
    });

    if (isJsonRequest(req)) {
      return NextResponse.json({ success: true });
    }
    return redirectWithMessage(req, redirectTo, 'success', 'Listing status updated.');
  } catch (err) {
    console.error('[api/admin/products/[id] POST] unexpected error', err);
    return respondError(req, 'An unexpected error occurred.', 500);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const { status } = await req.json() as { status: 'APPROVED' | 'REJECTED' | 'HIDDEN' };
    if (!['APPROVED', 'REJECTED', 'HIDDEN'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
    }

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
    if (status === 'APPROVED' && !hasStoredPackageDetails(existing)) {
      return NextResponse.json({ error: SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE }, { status: 400 });
    }

    const product = await prisma.product.update({
      where: { id },
      data: { status },
    });

    return NextResponse.json(product);
  } catch (err) {
    console.error('[api/admin/products/[id] PATCH] unexpected error', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

    await prisma.product.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/admin/products/[id] DELETE] unexpected error', err);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
