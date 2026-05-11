import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const schema = z.object({
  shopName: z.string().trim().min(2).max(80),
  shopLogoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  shopDescription: z.string().trim().max(500).optional().or(z.literal('')),
  // Ship-from address for live shipping rate calculation
  shipFromName: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromStreet: z.string().trim().max(200).optional().or(z.literal('')),
  shipFromCity: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromState: z.string().trim().max(50).optional().or(z.literal('')),
  shipFromZip: z.string().trim().max(20).optional().or(z.literal('')),
  shipFromCountry: z.string().trim().max(2).optional().or(z.literal('')),
  shipFromPhone: z.string().trim().max(30).optional().or(z.literal('')),
});

const PROFILE_SELECT = {
  id: true,
  shopName: true,
  shopLogoUrl: true,
  shopDescription: true,
  shipFromName: true,
  shipFromStreet: true,
  shipFromCity: true,
  shipFromState: true,
  shipFromZip: true,
  shipFromCountry: true,
  shipFromPhone: true,
} as const;

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

  const {
    shopName, shopLogoUrl, shopDescription,
    shipFromName, shipFromStreet, shipFromCity, shipFromState, shipFromZip, shipFromCountry, shipFromPhone,
  } = parsed.data;

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data: {
      shopName,
      shopLogoUrl: shopLogoUrl || null,
      shopDescription: shopDescription || null,
      shipFromName: shipFromName || null,
      shipFromStreet: shipFromStreet || null,
      shipFromCity: shipFromCity || null,
      shipFromState: shipFromState || null,
      shipFromZip: shipFromZip || null,
      shipFromCountry: shipFromCountry || null,
      shipFromPhone: shipFromPhone || null,
    },
    select: PROFILE_SELECT,
  });

  return NextResponse.json({ success: true, profile: updated });
}

export async function GET(_req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: PROFILE_SELECT,
  });

  if (!user) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ profile: user });
}
