import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { normalizeCurrency, normalizeIso2 } from '@/lib/airtime-agent';

export const dynamic = 'force-dynamic';

async function sellerId() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== 'SELLER') return null;
  return session.user.id;
}

export async function GET() {
  const id = await sellerId();
  if (!id) return NextResponse.json({ error: 'Seller account required.' }, { status: 403 });

  const profile = await prisma.airtimeAgentProfile.findUnique({
    where: { sellerId: id },
    include: {
      airtimeSales: { orderBy: { createdAt: 'desc' }, take: 20 },
      ledgerEntries: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  return NextResponse.json({ profile });
}

export async function POST(req: Request) {
  const id = await sellerId();
  if (!id) return NextResponse.json({ error: 'Seller account required.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const countryCode = normalizeIso2(body.countryCode);
  const currency = normalizeCurrency(body.currency);
  const businessName = String(body.businessName ?? '').trim().slice(0, 120) || null;
  if (!countryCode || !currency) {
    return NextResponse.json({ error: 'Valid 2-letter country and 3-letter currency codes are required.' }, { status: 400 });
  }

  const existing = await prisma.airtimeAgentProfile.findUnique({ where: { sellerId: id } });
  if (existing && existing.currency !== currency) {
    return NextResponse.json(
      { error: 'Agent wallet currency is locked after profile creation. Contact FlupFlap support to change it.' },
      { status: 409 },
    );
  }

  const profile = existing
    ? await prisma.airtimeAgentProfile.update({
        where: { sellerId: id },
        data: { countryCode, businessName },
      })
    : await prisma.airtimeAgentProfile.create({
        data: { sellerId: id, countryCode, currency, businessName },
      });

  return NextResponse.json({ profile }, { status: existing ? 200 : 201 });
}
