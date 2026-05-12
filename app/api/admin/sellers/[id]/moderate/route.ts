/**
 * POST /api/admin/sellers/[id]/moderate
 *
 * Allows admins to suspend, ban, or reinstate a seller account.
 *
 * Request body (form data):
 *   action         — "SUSPENDED" | "BANNED" | "REINSTATED"
 *   reasonCategory — one of the predefined reason keys (required unless reinstating)
 *   notes          — optional free-text admin notes
 *
 * Creates a SellerModerationLog entry for the audit trail.
 */

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const VALID_ACTIONS = ['SUSPENDED', 'BANNED', 'RESTRICTED', 'REINSTATED'] as const;

const VALID_REASON_CATEGORIES = [
  'misconduct_to_customer',
  'fake_product',
  'unlawful_activity',
  'fraud',
  'spam',
  'policy_violation',
  'other',
] as const;

const schema = z
  .object({
    action: z.enum(VALID_ACTIONS),
    reasonCategory: z.enum(VALID_REASON_CATEGORIES).optional(),
    notes: z.string().max(1000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.action !== 'REINSTATED' && !data.reasonCategory) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reasonCategory'],
        message: 'A reason category is required when suspending or banning.',
      });
    }
  });

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user || session.user.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;

    // Verify the target is a SELLER account
    const seller = await prisma.user.findUnique({ where: { id } });
    if (!seller || seller.role !== 'SELLER') {
      return NextResponse.json({ error: 'Seller not found.' }, { status: 404 });
    }

    const form = await req.formData();
    const raw = Object.fromEntries(
      [...form.entries()].map(([k, v]) => [k, v === '' ? undefined : v]),
    );
    const data = schema.parse(raw);

    // Update seller status
    await prisma.user.update({
      where: { id },
      data: {
        sellerStatus: data.action === 'REINSTATED' ? 'ACTIVE' : data.action,
        sellerStatusReason: data.action === 'REINSTATED' ? null : (data.reasonCategory ?? null),
        sellerStatusNotes: data.action === 'REINSTATED' ? null : (data.notes ?? null),
      },
    });

    // Write audit log
    await prisma.sellerModerationLog.create({
      data: {
        sellerId: id,
        adminId: session.user.id,
        action: data.action,
        reasonCategory: data.reasonCategory ?? null,
        notes: data.notes ?? null,
      },
    });

    // Fetch calls (from client components) get a JSON response.
    // Native form POSTs get a redirect so the page refreshes with flash message.
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.redirect(new URL('/admin/sellers?moderate=success', req.url));
  } catch (err: any) {
    if (err?.name === 'ZodError') {
      if (req.headers.get('accept')?.includes('application/json')) {
        return NextResponse.json({ error: 'Invalid input — please select an action and reason.' }, { status: 400 });
      }
      const errUrl = new URL('/admin/sellers', req.url);
      errUrl.searchParams.set('error', 'Invalid input — please select an action and reason.');
      return NextResponse.redirect(errUrl, 302);
    }
    console.error('[admin/sellers/moderate]', err);
    if (req.headers.get('accept')?.includes('application/json')) {
      return NextResponse.json({ error: 'Failed to update seller status. Please try again.' }, { status: 500 });
    }
    const errUrl = new URL('/admin/sellers', req.url);
    errUrl.searchParams.set('error', 'Failed to update seller status. Please try again.');
    return NextResponse.redirect(errUrl, 302);
  }
}
