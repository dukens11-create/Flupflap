import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  hasStoredPackageDetails,
  SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE,
} from '@/lib/product-package';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const form = await req.formData();
  const action = form.get('_method') as string;
  const redirectTo = (form.get('redirectTo') as string) || '/admin';
  const actionToStatus: Record<string, 'APPROVED' | 'REJECTED' | 'HIDDEN'> = {
    approve: 'APPROVED',
    reject: 'REJECTED',
    hide: 'HIDDEN',
  };

  if (action !== 'approve' && action !== 'reject' && action !== 'hide') {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  if (action === 'approve' && !hasStoredPackageDetails(product)) {
    return NextResponse.json({ error: SHIPPING_PACKAGE_DETAILS_REQUIRED_MESSAGE }, { status: 400 });
  }

  await prisma.product.update({
    where: { id },
    data: { status: actionToStatus[action] },
  });

  return NextResponse.redirect(new URL(redirectTo, req.url));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.product.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
