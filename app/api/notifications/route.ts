import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateSchema = z.object({
  ids: z.array(z.string().min(1)).optional(),
  markAllRead: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId, readAt: null },
      }),
    ]);

    return NextResponse.json({ notifications, unreadCount });
  } catch (error) {
    console.error('[notifications GET]', error);
    return NextResponse.json({ error: 'Failed to load notifications.' }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = session.user.id;
    if (!userId) {
      return NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 });
    }

    let parsed: z.infer<typeof updateSchema>;
    try {
      parsed = updateSchema.parse(await req.json());
    } catch {
      return NextResponse.json({ error: 'Invalid input.' }, { status: 400 });
    }

    const where = parsed.markAllRead
      ? { userId, readAt: null }
      : { userId, id: { in: parsed.ids ?? [] }, readAt: null };

    await prisma.notification.updateMany({
      where,
      data: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[notifications PATCH]', error);
    return NextResponse.json({ error: 'Failed to update notifications.' }, { status: 500 });
  }
}
