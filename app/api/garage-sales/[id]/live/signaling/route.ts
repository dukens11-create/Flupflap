import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const SIGNAL_ROLES = ['SELLER', 'BUYER'] as const;
const SIGNAL_KINDS = ['OFFER', 'ANSWER', 'ICE'] as const;

type SignalRole = (typeof SIGNAL_ROLES)[number];
type SignalKind = (typeof SIGNAL_KINDS)[number];

function isSignalRole(value: unknown): value is SignalRole {
  return typeof value === 'string' && SIGNAL_ROLES.includes(value as SignalRole);
}

function isSignalKind(value: unknown): value is SignalKind {
  return typeof value === 'string' && SIGNAL_KINDS.includes(value as SignalKind);
}

function parseSince(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function requireSellerOwner(saleSellerId: string) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (session.user.id !== saleSellerId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const };
}

/** GET /api/garage-sales/[id]/live/signaling?role=BUYER|SELLER&since=ISO_DATE */
export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const url = new URL(req.url);
  const roleParam = url.searchParams.get('role');

  if (!isSignalRole(roleParam)) {
    return NextResponse.json({ error: 'role must be BUYER or SELLER' }, { status: 400 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, status: true, isLive: true, sellerId: true, liveStartedAt: true },
  });
  if (!sale || sale.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (roleParam === 'SELLER') {
    const ownerCheck = await requireSellerOwner(sale.sellerId);
    if (!ownerCheck.ok) return ownerCheck.response;
  }

  if (!sale.isLive) {
    return NextResponse.json({ isLive: false, liveStartedAt: sale.liveStartedAt, signals: [] });
  }

  const sinceDate = parseSince(url.searchParams.get('since'));
  const counterpart = roleParam === 'SELLER' ? 'BUYER' : 'SELLER';

  const createdAtFilter: Prisma.DateTimeFilter | undefined = (() => {
    if (sinceDate && sale.liveStartedAt) {
      const gt = sinceDate > sale.liveStartedAt ? sinceDate : sale.liveStartedAt;
      return { gt };
    }
    if (sinceDate) return { gt: sinceDate };
    if (sale.liveStartedAt) return { gte: sale.liveStartedAt };
    return undefined;
  })();

  const signals = await prisma.garageSaleLiveSignal.findMany({
    where: {
      saleId: id,
      sender: counterpart,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 100,
    select: { id: true, sender: true, kind: true, payload: true, createdAt: true },
  });

  return NextResponse.json({ isLive: true, liveStartedAt: sale.liveStartedAt, signals });
}

/** POST /api/garage-sales/[id]/live/signaling */
export async function POST(req: Request, { params }: Params) {
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const role = (body as { role?: unknown })?.role;
  const kind = (body as { kind?: unknown })?.kind;
  const payload = (body as { payload?: unknown })?.payload;

  if (!isSignalRole(role)) {
    return NextResponse.json({ error: 'role must be BUYER or SELLER' }, { status: 400 });
  }
  if (!isSignalKind(kind)) {
    return NextResponse.json({ error: 'kind must be OFFER, ANSWER, or ICE' }, { status: 400 });
  }

  if (role === 'SELLER' && kind === 'ANSWER') {
    return NextResponse.json({ error: 'Seller cannot send ANSWER' }, { status: 400 });
  }
  if (role === 'BUYER' && kind === 'OFFER') {
    return NextResponse.json({ error: 'Buyer cannot send OFFER' }, { status: 400 });
  }

  if (payload == null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 });
  }

  const payloadRaw = JSON.stringify(payload);
  if (payloadRaw.length > 20000) {
    return NextResponse.json({ error: 'Payload exceeds maximum size of 20000 bytes' }, { status: 413 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: { id: true, status: true, isLive: true, sellerId: true },
  });
  if (!sale || sale.status !== 'APPROVED') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!sale.isLive) {
    return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
  }

  if (role === 'SELLER') {
    const ownerCheck = await requireSellerOwner(sale.sellerId);
    if (!ownerCheck.ok) return ownerCheck.response;
  }

  const signal = await prisma.garageSaleLiveSignal.create({
    data: {
      saleId: id,
      sender: role,
      kind,
      payload: payload as Prisma.InputJsonValue,
    },
    select: { id: true, sender: true, kind: true, createdAt: true },
  });

  return NextResponse.json(signal, { status: 201 });
}
