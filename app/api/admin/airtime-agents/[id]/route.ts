import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { validateWalletAdjustment } from '@/lib/airtime-agent';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Admin access required.' }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = String(body.action ?? '');

  if (action === 'approve' || action === 'suspend' || action === 'reject') {
    const status = action === 'approve' ? 'ACTIVE' : action === 'suspend' ? 'SUSPENDED' : 'REJECTED';
    const commissionBps = body.commissionBps == null ? undefined : Math.max(0, Math.min(5000, Math.trunc(Number(body.commissionBps))));
    const profile = await prisma.airtimeAgentProfile.update({
      where: { id },
      data: {
        status,
        ...(commissionBps == null || Number.isNaN(commissionBps) ? {} : { commissionBps }),
        approvedAt: status === 'ACTIVE' ? new Date() : undefined,
        suspendedAt: status === 'SUSPENDED' ? new Date() : null,
      },
    });
    return NextResponse.json({ profile });
  }

  if (action === 'fund') {
    const amountCents = validateWalletAdjustment(body.amountCents);
    if (amountCents == null || amountCents <= 0) {
      return NextResponse.json({ error: 'Funding amountCents must be a positive integer.' }, { status: 400 });
    }
    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.airtimeAgentProfile.update({
        where: { id },
        data: { walletBalanceCents: { increment: amountCents } },
      });
      await tx.airtimeAgentLedgerEntry.create({
        data: {
          profileId: id,
          type: 'FUNDING',
          amountCents,
          balanceAfterCents: profile.walletBalanceCents,
          note: String(body.note ?? 'Admin wallet funding').slice(0, 240),
        },
      });
      return profile;
    });
    return NextResponse.json({ profile: result });
  }

  if (action === 'adjust') {
    const amountCents = validateWalletAdjustment(body.amountCents);
    const note = String(body.note ?? '').trim().slice(0, 240);
    if (amountCents == null || !note) {
      return NextResponse.json({ error: 'A non-zero integer amountCents and adjustment note are required.' }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (amountCents < 0) {
        const changed = await tx.airtimeAgentProfile.updateMany({
          where: { id, walletBalanceCents: { gte: Math.abs(amountCents) } },
          data: { walletBalanceCents: { decrement: Math.abs(amountCents) } },
        });
        if (changed.count !== 1) return null;
      } else {
        await tx.airtimeAgentProfile.update({
          where: { id },
          data: { walletBalanceCents: { increment: amountCents } },
        });
      }

      const profile = await tx.airtimeAgentProfile.findUniqueOrThrow({ where: { id } });
      await tx.airtimeAgentLedgerEntry.create({
        data: {
          profileId: id,
          type: 'ADJUSTMENT',
          amountCents,
          balanceAfterCents: profile.walletBalanceCents,
          note,
        },
      });
      return profile;
    });

    if (!result) {
      return NextResponse.json({ error: 'Adjustment would make the wallet balance negative.' }, { status: 409 });
    }
    return NextResponse.json({ profile: result });
  }

  return NextResponse.json({ error: 'Unsupported action.' }, { status: 400 });
}
