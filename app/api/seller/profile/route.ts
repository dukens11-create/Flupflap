import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';
import { apiError } from '@/lib/api-response';
import { sessionHasRole } from '@/lib/user-roles';

const schema = z.object({
  shopName: z.string().trim().min(2).max(80),
  shopLogoUrl: z.string().trim().url().max(2000).optional().or(z.literal('')),
  shopDescription: z.string().trim().max(500).optional().or(z.literal('')),
  // Ship-from address for live shipping rate calculation
  shipFromName: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromStreet: z.string().trim().max(200).optional().or(z.literal('')),
  shipFromCity: z.string().trim().max(100).optional().or(z.literal('')),
  shipFromState: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || /^[A-Z]{2}$/.test(value), {
      message: 'Use a 2-letter state code.',
    })
    .optional()
    .or(z.literal('')),
  shipFromZip: z.string().trim().max(20).optional().or(z.literal('')),
  shipFromCountry: z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === '' || /^[A-Z]{2}$/.test(value), {
      message: 'Use a 2-letter country code.',
    })
    .optional()
    .or(z.literal('')),
  shipFromPhone: z.string().trim().max(30).optional().or(z.literal('')),
}).superRefine((value, ctx) => {
  const hasAnyShipFromField = Boolean(
    value.shipFromName
    || value.shipFromStreet
    || value.shipFromCity
    || value.shipFromState
    || value.shipFromZip
    || value.shipFromCountry
    || value.shipFromPhone,
  );
  if (!hasAnyShipFromField) return;

  if (!value.shipFromName) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromName'],
      message: 'Add a ship-from full name or business name.',
    });
  }
  if (!value.shipFromStreet) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromStreet'],
      message: 'Add a ship-from street address.',
    });
  }
  if (!value.shipFromCity) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromCity'],
      message: 'Add a ship-from city.',
    });
  }
  if (!value.shipFromState) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromState'],
      message: 'Add a 2-letter ship-from state code.',
    });
  }
  if (!value.shipFromZip) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromZip'],
      message: 'Add a ship-from ZIP or postal code.',
    });
  }
  if (!value.shipFromCountry) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['shipFromCountry'],
      message: 'Add a 2-letter ship-from country code.',
    });
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
    if (!sessionHasRole(session.user, 'SELLER')) {
      return apiError('Forbidden', 403);
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return apiError('Session expired. Please sign in again.', 401);
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

    let updated;
    try {
      updated = await prisma.user.update({
        where: { id: sellerId },
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
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2025') {
        return apiError('Seller account not found.', 404);
      }
      throw error;
    }

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
    if (!sessionHasRole(session.user, 'SELLER')) {
      return apiError('Forbidden', 403);
    }
    const sellerId = session.user.id;
    if (!sellerId) {
      return apiError('Session expired. Please sign in again.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: sellerId },
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
