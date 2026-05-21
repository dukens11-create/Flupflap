import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAdminSession } from '@/lib/wholesaler-auth';

export async function GET() {
  const adminSession = await requireAdminSession();
  if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const wholesalers = await prisma.supplierProfile.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json({ wholesalers });
}

export async function PATCH(req: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as { supplierProfileId?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'; reason?: string } | null;
  if (!body?.supplierProfileId || !body.status) {
    return NextResponse.json({ error: 'supplierProfileId and status are required.' }, { status: 400 });
  }

  const profile = await prisma.supplierProfile.update({
    where: { id: body.supplierProfileId },
    data: {
      status: body.status,
      statusReason: body.reason ?? null,
      approvedAt: body.status === 'APPROVED' ? new Date() : null,
      approvedById: body.status === 'APPROVED' ? adminSession.user.id : null,
    },
  });

  await prisma.product.updateMany({
    where: { wholesalerSupplierId: profile.userId },
    data: {
      status: body.status === 'APPROVED' ? 'APPROVED' : 'HIDDEN',
      delistedAt: body.status === 'APPROVED' ? null : new Date(),
    },
  });

  return NextResponse.json({ success: true, profile });
}

export async function POST(req: Request) {
  const adminSession = await requireAdminSession();
  if (!adminSession) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const form = await req.formData();
  const supplierProfileId = String(form.get('supplierProfileId') ?? '').trim();
  const status = String(form.get('status') ?? '').trim() as 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  const reason = String(form.get('reason') ?? '').trim();

  if (!supplierProfileId || !status) {
    return NextResponse.json({ error: 'supplierProfileId and status are required.' }, { status: 400 });
  }

  const profile = await prisma.supplierProfile.update({
    where: { id: supplierProfileId },
    data: {
      status,
      statusReason: reason || null,
      approvedAt: status === 'APPROVED' ? new Date() : null,
      approvedById: status === 'APPROVED' ? adminSession.user.id : null,
    },
  });

  await prisma.product.updateMany({
    where: { wholesalerSupplierId: profile.userId },
    data: {
      status: status === 'APPROVED' ? 'APPROVED' : 'HIDDEN',
      delistedAt: status === 'APPROVED' ? null : new Date(),
    },
  });

  return NextResponse.redirect(new URL('/admin/wholesalers', req.url), 303);
}
