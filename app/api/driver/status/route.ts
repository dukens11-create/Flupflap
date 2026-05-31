import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isDatabaseConfigured, prisma } from '@/lib/db';
import { type DriverStatus, type DriverStatusSnapshot } from '@/lib/driver-status';

const querySchema = z.object({
  driverId: z.string().min(1).max(128),
});

const updateSchema = z.object({
  driverId: z.string().min(1).max(128),
  status: z.enum(['ONLINE', 'OFFLINE']),
  reason: z.string().max(120).nullable().optional(),
  expectedVersion: z.number().int().min(0).optional(),
  source: z.string().max(64).optional(),
});

type MemoryState = DriverStatusSnapshot & { changedAt: string };

const memoryStore = new Map<string, MemoryState>();
const memoryLogs: Array<{
  driverId: string;
  status: DriverStatus;
  reason: string | null;
  changedAt: string;
  source: string;
}> = [];

function buildSnapshot(data: {
  driverId: string;
  status: DriverStatus;
  reason: string | null;
  lastOnlineAt: Date | string | null;
  version: number;
  updatedAt: Date | string;
}): DriverStatusSnapshot {
  return {
    driverId: data.driverId,
    status: data.status,
    reason: data.reason,
    lastOnlineAt: data.lastOnlineAt ? new Date(data.lastOnlineAt).toISOString() : null,
    version: data.version,
    updatedAt: new Date(data.updatedAt).toISOString(),
  };
}

function defaultSnapshot(driverId: string): DriverStatusSnapshot {
  return {
    driverId,
    status: 'OFFLINE',
    reason: null,
    lastOnlineAt: null,
    version: 0,
    updatedAt: new Date(0).toISOString(),
  };
}

function broadcastStatusChange(snapshot: DriverStatusSnapshot, source: string) {
  console.info('[driver-status:broadcast]', {
    driverId: snapshot.driverId,
    status: snapshot.status,
    version: snapshot.version,
    source,
  });
}

async function readFromDatabase(driverId: string): Promise<DriverStatusSnapshot | null> {
  const state = await prisma.driverAvailabilityState.findUnique({
    where: { driverId },
  });
  if (!state) return null;
  return buildSnapshot({
    driverId: state.driverId,
    status: state.status as DriverStatus,
    reason: state.offlineReason,
    lastOnlineAt: state.lastOnlineAt,
    version: state.version,
    updatedAt: state.updatedAt,
  });
}

async function writeToDatabase(input: z.infer<typeof updateSchema>): Promise<{
  snapshot: DriverStatusSnapshot;
  conflict: boolean;
}> {
  const existing = await prisma.driverAvailabilityState.findUnique({
    where: { driverId: input.driverId },
  });

  if (!existing) {
    const created = await prisma.driverAvailabilityState.create({
      data: {
        driverId: input.driverId,
        status: input.status,
        offlineReason: input.status === 'OFFLINE' ? input.reason ?? null : null,
        lastOnlineAt: null,
        version: 1,
      },
    });

    await prisma.driverAvailabilityLog.create({
      data: {
        driverId: input.driverId,
        stateId: created.id,
        status: input.status,
        reason: created.offlineReason,
        source: input.source ?? 'dashboard',
      },
    });

    return {
      snapshot: buildSnapshot({
        driverId: created.driverId,
        status: created.status as DriverStatus,
        reason: created.offlineReason,
        lastOnlineAt: created.lastOnlineAt,
        version: created.version,
        updatedAt: created.updatedAt,
      }),
      conflict: false,
    };
  }

  if (typeof input.expectedVersion === 'number' && input.expectedVersion !== existing.version) {
    return {
      snapshot: buildSnapshot({
        driverId: existing.driverId,
        status: existing.status as DriverStatus,
        reason: existing.offlineReason,
        lastOnlineAt: existing.lastOnlineAt,
        version: existing.version,
        updatedAt: existing.updatedAt,
      }),
      conflict: true,
    };
  }

  const lastOnlineAt =
    input.status === 'OFFLINE' && existing.status === 'ONLINE'
      ? new Date()
      : existing.lastOnlineAt;

  const updated = await prisma.driverAvailabilityState.updateMany({
    where: {
      driverId: input.driverId,
      version: existing.version,
    },
    data: {
      status: input.status,
      offlineReason: input.status === 'OFFLINE' ? input.reason ?? null : null,
      lastOnlineAt,
      version: { increment: 1 },
    },
  });

  if (updated.count === 0) {
    const latest = await prisma.driverAvailabilityState.findUnique({
      where: { driverId: input.driverId },
    });

    return {
      snapshot: latest
        ? buildSnapshot({
            driverId: latest.driverId,
            status: latest.status as DriverStatus,
            reason: latest.offlineReason,
            lastOnlineAt: latest.lastOnlineAt,
            version: latest.version,
            updatedAt: latest.updatedAt,
          })
        : defaultSnapshot(input.driverId),
      conflict: true,
    };
  }

  const refreshed = await prisma.driverAvailabilityState.findUniqueOrThrow({
    where: { driverId: input.driverId },
  });

  await prisma.driverAvailabilityLog.create({
    data: {
      driverId: input.driverId,
      stateId: refreshed.id,
      status: input.status,
      reason: refreshed.offlineReason,
      source: input.source ?? 'dashboard',
    },
  });

  return {
    snapshot: buildSnapshot({
      driverId: refreshed.driverId,
      status: refreshed.status as DriverStatus,
      reason: refreshed.offlineReason,
      lastOnlineAt: refreshed.lastOnlineAt,
      version: refreshed.version,
      updatedAt: refreshed.updatedAt,
    }),
    conflict: false,
  };
}

function readFromMemory(driverId: string): DriverStatusSnapshot {
  const current = memoryStore.get(driverId);
  if (!current) return defaultSnapshot(driverId);
  return current;
}

function writeToMemory(input: z.infer<typeof updateSchema>): DriverStatusSnapshot {
  const nowIso = new Date().toISOString();
  const current = memoryStore.get(input.driverId);
  const version = (current?.version ?? 0) + 1;
  const next: MemoryState = {
    driverId: input.driverId,
    status: input.status,
    reason: input.status === 'OFFLINE' ? input.reason ?? null : null,
    lastOnlineAt:
      input.status === 'OFFLINE' && current?.status === 'ONLINE'
        ? nowIso
        : (current?.lastOnlineAt ?? null),
    version,
    updatedAt: nowIso,
    changedAt: nowIso,
  };
  memoryStore.set(input.driverId, next);
  memoryLogs.push({
    driverId: next.driverId,
    status: next.status,
    reason: next.reason,
    changedAt: nowIso,
    source: input.source ?? 'dashboard',
  });
  return next;
}

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: 'driverId is required.' }, { status: 400 });
  }

  const { driverId } = parsed.data;

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ status: readFromMemory(driverId), fallback: 'memory' });
  }

  try {
    const snapshot = (await readFromDatabase(driverId)) ?? readFromMemory(driverId);
    return NextResponse.json({ status: snapshot, fallback: snapshot.version ? undefined : 'memory' });
  } catch (error) {
    console.error('[driver-status GET]', error);
    return NextResponse.json({ status: readFromMemory(driverId), fallback: 'memory' });
  }
}

export async function PUT(request: Request) {
  const payload = updateSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const input = payload.data;

  if (!isDatabaseConfigured()) {
    const snapshot = writeToMemory(input);
    broadcastStatusChange(snapshot, input.source ?? 'dashboard');
    return NextResponse.json({ status: snapshot, fallback: 'memory' });
  }

  try {
    const result = await writeToDatabase(input);
    if (result.conflict) {
      return NextResponse.json(
        { error: 'Status update conflict. Please retry.', status: result.snapshot },
        { status: 409 },
      );
    }
    broadcastStatusChange(result.snapshot, input.source ?? 'dashboard');
    return NextResponse.json({ status: result.snapshot });
  } catch (error) {
    console.error('[driver-status PUT]', error);
    const snapshot = writeToMemory(input);
    return NextResponse.json(
      {
        error: 'Database unavailable, switched to memory fallback.',
        status: snapshot,
        fallback: 'memory',
      },
      { status: 202 },
    );
  }
}
