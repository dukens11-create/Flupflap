import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  shopName: z.string().trim().min(2).max(80).optional(),
  shopLogoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  shopDescription: z.string().trim().max(500).optional().or(z.literal('')),
});

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { shopName, shopLogoUrl, shopDescription } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      ...(shopName !== undefined ? { shopName } : {}),
      ...(shopLogoUrl !== undefined ? { shopLogoUrl: shopLogoUrl || null } : {}),
      ...(shopDescription !== undefined ? { shopDescription: shopDescription || null } : {}),
    },
    select: {
      id: true,
      shopName: true,
      shopLogoUrl: true,
      shopDescription: true,
    },
  });

  return NextResponse.json({ success: true, profile: updated });
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      shopName: true,
      shopLogoUrl: true,
      shopDescription: true,
    },
  });

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ profile: user });
}
