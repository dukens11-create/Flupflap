import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import {
  LIVE_SIGNAL_KINDS,
  LIVE_SIGNAL_ROLES,
  type LiveSignalKind,
  type LiveSignalRole,
  getLiveRoomId,
  getLiveSessionId,
} from '@/lib/live-signaling';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

// Buyer heartbeats are sent every 15 seconds, so a 35-second window keeps the
// count responsive while tolerating a missed poll or brief network delay.
const ACTIVE_VIEWER_WINDOW_MS = 35_000;

const SIGNAL_ROLES = Object.values(LIVE_SIGNAL_ROLES);
const SIGNAL_KINDS = Object.values(LIVE_SIGNAL_KINDS);

function isSignalRole(value: unknown): value is LiveSignalRole {
  return typeof value === 'string' && SIGNAL_ROLES.includes(value as LiveSignalRole);
}

function isSignalKind(value: unknown): value is LiveSignalKind {
  return typeof value === 'string' && SIGNAL_KINDS.includes(value as LiveSignalKind);
}

function parseSince(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function checkSellerOwner(saleSellerId: string, userId: string | null) {
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (userId !== saleSellerId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const };
}

function requireRoleAccess(role: LiveSignalRole, saleSellerId: string, userId: string | null) {
  if (role === LIVE_SIGNAL_ROLES.SELLER) {
    return checkSellerOwner(saleSellerId, userId);
  }
  return { ok: true as const };
}

async function getActiveViewerCount(saleId: string, liveStartedAt: Date | null) {
  const activeSince = new Date(
    Math.max(
      Date.now() - ACTIVE_VIEWER_WINDOW_MS,
      liveStartedAt?.getTime() ?? 0,
    ),
  );

  const rows = await prisma.$queryRaw<Array<{ viewerCount: bigint | number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT payload->>'viewerId') AS "viewerCount"
    FROM "GarageSaleLiveSignal"
    WHERE "saleId" = ${saleId}
      AND sender = 'BUYER'
      AND kind = 'VIEWER_HEARTBEAT'
      AND "createdAt" >= ${activeSince}
      AND COALESCE(payload->>'viewerId', '') <> ''
  `);

  const viewerCount = rows[0]?.viewerCount ?? 0;
  return typeof viewerCount === 'bigint' ? Number(viewerCount) : viewerCount;
}

async function getReadyViewerCount(saleId: string, liveStartedAt: Date | null) {
  if (!liveStartedAt) return 0;
  const rows = await prisma.$queryRaw<Array<{ viewerCount: bigint | number }>>(Prisma.sql`
    SELECT COUNT(DISTINCT payload->>'viewerId') AS "viewerCount"
    FROM "GarageSaleLiveSignal"
    WHERE "saleId" = ${saleId}
      AND sender = 'BUYER'
      AND kind = 'STREAM_READY'
      AND "createdAt" >= ${liveStartedAt}
      AND COALESCE(payload->>'viewerId', '') <> ''
  `);

  const viewerCount = rows[0]?.viewerCount ?? 0;
  return typeof viewerCount === 'bigint' ? Number(viewerCount) : viewerCount;
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
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      isSpam: true,
      startDate: true,
      endDate: true,
      isLive: true,
      sellerId: true,
      liveStartedAt: true,
    },
  });
  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!isGarageSalePubliclyVisible(sale)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const accessCheck = requireRoleAccess(roleParam, sale.sellerId, userId);
  if (!accessCheck.ok) return accessCheck.response;

  if (!sale.isLive) {
    return NextResponse.json({
      isLive: false,
      liveStartedAt: sale.liveStartedAt,
      liveSessionId: getLiveSessionId(id, sale.liveStartedAt),
      roomId: getLiveRoomId(id),
      viewerCount: 0,
      streamReadyCount: 0,
      signals: [],
    });
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

  const viewerCount = await getActiveViewerCount(id, sale.liveStartedAt);
  const streamReadyCount = await getReadyViewerCount(id, sale.liveStartedAt);

  return NextResponse.json({
    isLive: true,
    liveStartedAt: sale.liveStartedAt,
    liveSessionId: getLiveSessionId(id, sale.liveStartedAt),
    roomId: getLiveRoomId(id),
    viewerCount,
    streamReadyCount,
    signals,
  });
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
    return NextResponse.json({ error: 'kind must be OFFER, ANSWER, ICE, VIEWER_HEARTBEAT, STREAM_READY, GUEST_OFFER, GUEST_ANSWER, or GUEST_ICE' }, { status: 400 });
  }

  if (role === LIVE_SIGNAL_ROLES.SELLER && kind === LIVE_SIGNAL_KINDS.ANSWER) {
    return NextResponse.json({ error: 'Seller cannot send ANSWER' }, { status: 400 });
  }
  if (role === LIVE_SIGNAL_ROLES.BUYER && kind === LIVE_SIGNAL_KINDS.OFFER) {
    return NextResponse.json({ error: 'Buyer cannot send OFFER' }, { status: 400 });
  }
  if (role === LIVE_SIGNAL_ROLES.SELLER && kind === LIVE_SIGNAL_KINDS.VIEWER_HEARTBEAT) {
    return NextResponse.json({ error: 'Seller cannot send VIEWER_HEARTBEAT' }, { status: 400 });
  }
  if (role === LIVE_SIGNAL_ROLES.SELLER && kind === LIVE_SIGNAL_KINDS.STREAM_READY) {
    return NextResponse.json({ error: 'Seller cannot send STREAM_READY' }, { status: 400 });
  }
  // Guest signaling: GUEST_OFFER comes from BUYER, GUEST_ANSWER comes from SELLER
  if (role === LIVE_SIGNAL_ROLES.SELLER && kind === LIVE_SIGNAL_KINDS.GUEST_OFFER) {
    return NextResponse.json({ error: 'Seller cannot send GUEST_OFFER' }, { status: 400 });
  }
  if (role === LIVE_SIGNAL_ROLES.BUYER && kind === LIVE_SIGNAL_KINDS.GUEST_ANSWER) {
    return NextResponse.json({ error: 'Buyer cannot send GUEST_ANSWER' }, { status: 400 });
  }

  if (payload == null || typeof payload !== 'object') {
    return NextResponse.json({ error: 'payload must be an object' }, { status: 400 });
  }

  const payloadRaw = JSON.stringify(payload);
  if (Buffer.byteLength(payloadRaw, 'utf8') > 20000) {
    return NextResponse.json({ error: 'Payload exceeds maximum size of 20000 bytes' }, { status: 413 });
  }

  const sale = await prisma.garageSale.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      isArchived: true,
      isSpam: true,
      startDate: true,
      endDate: true,
      isLive: true,
      sellerId: true,
    },
  });
  if (!sale) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!isGarageSalePubliclyVisible(sale)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!sale.isLive) {
    return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
  }
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ?? null;

  const accessCheck = requireRoleAccess(role, sale.sellerId, userId);
  if (!accessCheck.ok) return accessCheck.response;

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
