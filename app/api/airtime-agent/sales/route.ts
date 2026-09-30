import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { calculateAgentSaleEconomics, normalizeIso2 } from '@/lib/airtime-agent';
import { sendReloadlyTopup } from '@/lib/reloadly-airtime';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Seller account required.' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const operatorId = Number(body.operatorId);
  const amountCents = Number(body.amountCents);
  const recipientCountryCode = normalizeIso2(body.recipientCountryCode);
  const recipientPhone = String(body.recipientPhone ?? '').replace(/[^0-9+]/g, '');
  if (!Number.isInteger(operatorId) || operatorId <= 0 || !Number.isInteger(amountCents) || amountCents <= 0 || !recipientCountryCode || recipientPhone.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ error: 'Operator, amount, country, and recipient phone are required.' }, { status: 400 });
  }

  const profile = await prisma.airtimeAgentProfile.findUnique({ where: { sellerId: session.user.id } });
  if (!profile || profile.status !== 'ACTIVE') {
    return NextResponse.json({ error: 'Your airtime agent account must be approved before selling.' }, { status: 403 });
  }

  const accountCurrency = (process.env.RELOADLY_ACCOUNT_CURRENCY ?? 'USD').trim().toUpperCase();
  if (profile.currency !== accountCurrency) {
    return NextResponse.json({ error: 'Agent wallet currency is not enabled for live airtime sales yet.' }, { status: 409 });
  }

  const economics = calculateAgentSaleEconomics(amountCents, profile.commissionBps);
  const reference = 'flupflap-' + randomUUID();

  const reserved = await prisma.$transaction(async (tx) => {
    const changed = await tx.airtimeAgentProfile.updateMany({
      where: { id: profile.id, status: 'ACTIVE', walletBalanceCents: { gte: economics.debitCents } },
      data: { walletBalanceCents: { decrement: economics.debitCents } },
    });
    if (changed.count !== 1) return null;
    const fresh = await tx.airtimeAgentProfile.findUniqueOrThrow({ where: { id: profile.id } });
    const sale = await tx.airtimeSale.create({
      data: {
        profileId: profile.id,
        externalReference: reference,
        operatorId,
        recipientCountryCode,
        recipientPhone,
        amountCents,
        debitCents: economics.debitCents,
        commissionCents: economics.commissionCents,
        currency: profile.currency,
      },
    });
    await tx.airtimeAgentLedgerEntry.create({
      data: {
        profileId: profile.id,
        type: 'SALE_DEBIT',
        amountCents: -economics.debitCents,
        balanceAfterCents: fresh.walletBalanceCents,
        referenceId: sale.id,
        note: 'Airtime sale reservation',
      },
    });
    return sale;
  });

  if (!reserved) {
    return NextResponse.json({ error: 'Insufficient agent wallet balance.' }, { status: 409 });
  }

  try {
    const provider = await sendReloadlyTopup({
      operatorId,
      amountCents,
      recipientCountryCode,
      recipientPhone,
      customIdentifier: reference,
    });
    const providerCostCents = Number.isFinite(Number(provider.balanceInfo?.cost))
      ? Math.round(Number(provider.balanceInfo?.cost) * 100)
      : null;
    const updated = await prisma.airtimeSale.update({
      where: { id: reserved.id },
      data: {
        status: String(provider.status ?? 'SUCCESSFUL').toUpperCase(),
        providerTransactionId: provider.transactionId == null ? null : String(provider.transactionId),
        providerCostCents,
        providerPayload: provider as any,
      },
    });
    await prisma.airtimeAgentProfile.update({
      where: { id: profile.id },
      data: {
        lifetimeSalesCents: { increment: amountCents },
        lifetimeCommissionCents: { increment: economics.commissionCents },
      },
    });
    return NextResponse.json({ sale: updated });
  } catch (err: any) {
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.airtimeAgentProfile.update({
        where: { id: profile.id },
        data: { walletBalanceCents: { increment: economics.debitCents } },
      });
      await tx.airtimeSale.update({
        where: { id: reserved.id },
        data: {
          status: 'FAILED',
          failureCode: String(err?.code ?? 'TOPUP_FAILED').slice(0, 100),
          failureMessage: String(err?.message ?? 'Top-up failed').slice(0, 500),
          providerPayload: err?.payload ?? undefined,
        },
      });
      await tx.airtimeAgentLedgerEntry.create({
        data: {
          profileId: profile.id,
          type: 'REFUND',
          amountCents: economics.debitCents,
          balanceAfterCents: fresh.walletBalanceCents,
          referenceId: reserved.id,
          note: 'Automatic refund after failed airtime top-up',
        },
      });
    });
    return NextResponse.json({ error: String(err?.message ?? 'Top-up failed'), code: err?.code ?? 'TOPUP_FAILED' }, { status: 502 });
  }
}
