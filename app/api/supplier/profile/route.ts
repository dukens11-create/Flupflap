import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { requireSupplierSession } from '@/lib/wholesaler-auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const auth = await requireSupplierSession();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ profile: auth.profile });
}

export async function PATCH(req: Request) {
  const auth = await requireSupplierSession();
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json().catch(() => null) as { displayName?: string; companyName?: string } | null;
  const displayName = body?.displayName?.trim();
  const companyName = body?.companyName?.trim() ?? null;

  if (!displayName) {
    return NextResponse.json({ error: 'Display name is required.' }, { status: 400 });
  }

  const profile = await prisma.supplierProfile.update({
    where: { id: auth.profile.id },
    data: { displayName, companyName },
  });

  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== 'SELLER' || !session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let displayName = session.user.name || 'Supplier';
  let companyName: string | null = null;
  try {
    const body = await req.json() as { displayName?: string; companyName?: string };
    displayName = body?.displayName?.trim() || displayName;
    companyName = body?.companyName?.trim() ?? null;
  } catch {
    const form = await req.formData().catch(() => null);
    displayName = String(form?.get('displayName') ?? displayName).trim() || displayName;
    const maybeCompany = String(form?.get('companyName') ?? '').trim();
    companyName = maybeCompany || null;
  }

  const profile = await prisma.supplierProfile.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      displayName,
      companyName,
      status: 'PENDING',
    },
    update: {
      displayName,
      companyName,
    },
  });

  return NextResponse.json({ profile });
}
