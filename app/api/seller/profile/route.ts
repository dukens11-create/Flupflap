import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';

const optionalTwoLetterCode = z.union([z.literal(''), z.string().trim().length(2)]).optional();

const schema = z.object({
  shopName: z.string().trim().min(2).max(80),
  shopLogoUrl: z.string().url().max(2000).optional().or(z.literal('')),
  shopDescription: z.string().trim().max(500).optional().or(z.literal('')),
  // Ship-from address for live shipping rate calculation
  shipFromName: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromStreet: z.string().trim().max(200).optional().or(z.literal('')),
  shipFromCity: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromState: optionalTwoLetterCode,
  shipFromZip: z.string().trim().max(20).optional().or(z.literal('')),
  shipFromCountry: optionalTwoLetterCode,
  shipFromPhone: z.string().trim().max(30).optional().or(z.literal('')),
}).superRefine((data, ctx) => {
  const hasAnyShipFrom = [
    data.shipFromStreet,
    data.shipFromCity,
    data.shipFromState,
    data.shipFromZip,
    data.shipFromCountry,
  ].some((value) => !!value?.trim());

  if (!hasAnyShipFrom) return;

  if (!data.shipFromStreet?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shipFromStreet'], message: 'Street is required when ship-from address is provided.' });
  }
  if (!data.shipFromCity?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shipFromCity'], message: 'City is required when ship-from address is provided.' });
  }
  if (!data.shipFromState?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shipFromState'], message: 'State is required when ship-from address is provided.' });
  }
  if (!data.shipFromZip?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shipFromZip'], message: 'ZIP code is required when ship-from address is provided.' });
  }
  if (!data.shipFromCountry?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shipFromCountry'], message: 'Country is required when ship-from address is provided.' });
  }
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
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return apiError('Unauthorized', 401);
    }
    if (session.user.role !== 'SELLER') {
      return apiError('Forbidden', 403);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON', 400);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return apiError(firstIssue?.message ?? 'Validation failed', 422, parsed.error.flatten());
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
  } catch (error) {
    console.error('[seller/profile PATCH]', error);
    return apiError('Failed to save shop profile.', 500);
  }
}

export async function GET(_req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return apiError('Unauthorized', 401);
    }
    if (session.user.role !== 'SELLER') {
      return apiError('Forbidden', 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: PROFILE_SELECT,
    });

    if (!user) {
      return apiError('Not found', 404);
    }

    return NextResponse.json({ profile: user });
  } catch (error) {
    console.error('[seller/profile GET]', error);
    return apiError('Failed to load shop profile.', 500);
  }
}
