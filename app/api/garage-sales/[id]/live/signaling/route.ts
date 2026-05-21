import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { Prisma } from '@prisma/client';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import {
  buildGarageSaleLiveSessionId,
  getSignalViewerId,
  payloadHasLiveSession,
} from '@/lib/garage-sale-live-stream';
import { isGarageSalePubliclyVisible } from '@/lib/garage-sale-visibility';
import { logInfo, logWarn } from '@/lib/logger';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const SIGNAL_ROLES = ['SELLER', 'BUYER'] as const;
const SIGNAL_KINDS = ['BROADCASTER_READY', 'OFFER', 'ANSWER', 'ICE', 'VIEWER_JOIN', 'VIEWER_HEARTBEAT', 'VIEWER_LEAVE'] as const;
// Buyer heartbeats are sent every 15 seconds, so a 35-second window keeps the
// count responsive while tolerating a missed poll or brief network delay.
const ACTIVE_VIEWER_WINDOW_MS = 35_000;

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

function checkSellerOwner(saleSellerId: string, userId: string | null) {
  if (!userId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  if (userId !== saleSellerId) {
    return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const };
}

function requireRoleAccess(role: SignalRole, saleSellerId: string, userId: string | null) {
  if (role === 'SELLER') {
    return checkSellerOwner(saleSellerId, userId);
  }
  return { ok: true as const };
}

async function getActiveViewerCount(saleId: string, liveStartedAt: Date | null) {
  const liveSessionId = buildGarageSaleLiveSessionId(saleId, liveStartedAt);
  if (!liveSessionId) return 0;

  const activeSince = new Date(
    Math.max(
      Date.now() - ACTIVE_VIEWER_WINDOW_MS,
      liveStartedAt?.getTime() ?? 0,
    ),
  );

  const rows = await prisma.$queryRaw<Array<{ viewerCount: bigint | number }>>(Prisma.sql`
    SELECT COUNT(*) AS "viewerCount"
    FROM (
      SELECT DISTINCT ON (payload->>'viewerId')
        payload->>'viewerId' AS "viewerId",
        kind
      FROM "GarageSaleLiveSignal"
      WHERE "saleId" = ${saleId}
        AND sender = 'BUYER'
        AND kind IN ('VIEWER_JOIN', 'VIEWER_HEARTBEAT', 'VIEWER_LEAVE')
        AND "createdAt" >= ${activeSince}
        AND COALESCE(payload->>'viewerId', '') <> ''
        AND COALESCE(payload->>'liveSessionId', '') = ${liveSessionId}
      ORDER BY payload->>'viewerId', "createdAt" DESC
    ) latest
    WHERE kind <> 'VIEWER_LEAVE'
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
    return NextResponse.json({ isLive: false, liveStartedAt: sale.liveStartedAt, liveSessionId: null, viewerCount: 0, signals: [] });
  }

  const sinceDate = parseSince(url.searchParams.get('since'));
  const liveSessionId = buildGarageSaleLiveSessionId(id, sale.liveStartedAt);
  if (!liveSessionId) {
    return NextResponse.json({ isLive: false, liveStartedAt: sale.liveStartedAt, liveSessionId: null, viewerCount: 0, signals: [] });
  }
  const viewerId = roleParam === 'BUYER'
    ? (() => {
      const candidate = url.searchParams.get('viewerId');
      return candidate && candidate.trim() ? candidate : null;
    })()
    : null;

  if (roleParam === 'BUYER' && !viewerId) {
    return NextResponse.json({ error: 'viewerId is required for BUYER role' }, { status: 400 });
  }
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

  const signals = (await prisma.garageSaleLiveSignal.findMany({
    where: {
      saleId: id,
      sender: counterpart,
      ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
    },
    orderBy: { createdAt: 'asc' },
    take: 200,
    select: { id: true, sender: true, kind: true, payload: true, createdAt: true },
  })).filter((signal) => {
    if (!payloadHasLiveSession(signal.payload, liveSessionId)) return false;
    if (roleParam !== 'BUYER') return true;

    const signalViewerId = getSignalViewerId(signal.payload);
    return signalViewerId === viewerId;
  }).slice(-100);

  const viewerCount = await getActiveViewerCount(id, sale.liveStartedAt);

  return NextResponse.json({ isLive: true, liveStartedAt: sale.liveStartedAt, liveSessionId, viewerCount, signals });
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
    return NextResponse.json({ error: 'kind must be BROADCASTER_READY, OFFER, ANSWER, ICE, VIEWER_JOIN, VIEWER_HEARTBEAT, or VIEWER_LEAVE' }, { status: 400 });
  }

  if (role === 'SELLER' && kind === 'ANSWER') {
    return NextResponse.json({ error: 'Seller cannot send ANSWER' }, { status: 400 });
  }
  if (role === 'BUYER' && (kind === 'BROADCASTER_READY' || kind === 'OFFER')) {
    return NextResponse.json({ error: 'Buyer cannot send BROADCASTER_READY or OFFER' }, { status: 400 });
  }
  if (role === 'SELLER' && (kind === 'VIEWER_JOIN' || kind === 'VIEWER_HEARTBEAT' || kind === 'VIEWER_LEAVE')) {
    return NextResponse.json({ error: 'Seller cannot send viewer presence signals' }, { status: 400 });
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
      liveStartedAt: true,
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

  const liveSessionId = buildGarageSaleLiveSessionId(id, sale.liveStartedAt);
  if (!liveSessionId) {
    return NextResponse.json({ error: 'Live session is not active' }, { status: 422 });
  }

  if (!payloadHasLiveSession(payload, liveSessionId)) {
    logWarn('Rejected live signal with mismatched session id', {
      tag: 'garage-sales/[id]/live/signaling/POST',
      saleId: id,
      role,
      kind,
      liveSessionId,
    });
    return NextResponse.json({ error: 'payload.liveSessionId must match the active live session' }, { status: 409 });
  }

  const viewerId = getSignalViewerId(payload);
  const requiresViewerId = role === 'BUYER' || kind === 'OFFER' || kind === 'ICE';
  if (requiresViewerId && !viewerId) {
    return NextResponse.json({ error: 'payload.viewerId is required for this signal' }, { status: 400 });
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

  if (kind === 'BROADCASTER_READY' || kind === 'VIEWER_JOIN' || kind === 'VIEWER_LEAVE') {
    logInfo('Live signaling event recorded', {
      tag: 'garage-sales/[id]/live/signaling/POST',
      saleId: id,
      role,
      kind,
      liveSessionId,
      viewerId,
    });
  }

  return NextResponse.json({ ...signal, liveSessionId, viewerId }, { status: 201 });
}
