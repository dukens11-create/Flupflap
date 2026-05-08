import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { revalidateProductsCache } from '@/lib/cache-tags';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const form = await req.formData();
  const action = form.get('_method') as string;

  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  await prisma.product.update({
    where: { id },
    data: { status: action === 'approve' ? 'APPROVED' : 'REJECTED' },
  });

  revalidateProductsCache(id);
  return NextResponse.redirect(new URL('/admin', req.url));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  const { status } = await req.json() as { status: 'APPROVED' | 'REJECTED' };
  if (!['APPROVED', 'REJECTED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 });
  }

  const product = await prisma.product.update({
    where: { id },
    data: { status },
  });

  revalidateProductsCache(product.id);
  return NextResponse.json(product);
}
