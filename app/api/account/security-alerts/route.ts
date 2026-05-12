import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { describeSuspiciousReason } from '@/lib/login-security';

const SUSPICIOUS_LOGIN_LOOKBACK_DAYS = 30;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [recentLogins, suspiciousLogins] = await Promise.all([
    prisma.loginActivity.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        ipLabel: true,
        deviceLabel: true,
        suspicious: true,
        suspiciousReasons: true,
        createdAt: true,
      },
    }),
    prisma.loginActivity.findMany({
      where: {
        userId: session.user.id,
        suspicious: true,
        createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * SUSPICIOUS_LOGIN_LOOKBACK_DAYS) },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: {
        id: true,
        ipLabel: true,
        deviceLabel: true,
        suspiciousReasons: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({
    recentLogins: recentLogins.map((login) => ({
      ...login,
      createdAt: login.createdAt.toISOString(),
      suspiciousReasons: login.suspiciousReasons.map(describeSuspiciousReason),
    })),
    suspiciousLogins: suspiciousLogins.map((login) => ({
      ...login,
      createdAt: login.createdAt.toISOString(),
      suspiciousReasons: login.suspiciousReasons.map(describeSuspiciousReason),
    })),
  });
}
