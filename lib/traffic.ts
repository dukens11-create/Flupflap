import crypto from 'crypto';
import { prisma } from '@/lib/db';

function getDayBucket(input: Date): Date {
  const day = new Date(input);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getWeekStart(input: Date): Date {
  const weekStart = getDayBucket(input);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  return weekStart;
}

function getMonthStart(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), 1);
}

function hashVisitor(ip: string, userAgent: string): string {
  const salt = process.env.TRAFFIC_HASH_SALT ?? process.env.NEXTAUTH_SECRET;
  if (!salt) {
    throw new Error('Missing TRAFFIC_HASH_SALT (or NEXTAUTH_SECRET) for visitor hashing.');
  }
  return crypto.createHash('sha256').update(`${ip}|${userAgent}|${salt}`).digest('hex');
}

export async function trackVisitorHit(input: { ip?: string | null; userAgent?: string | null }) {
  const ip = input.ip?.trim() || 'unknown';
  const userAgent = input.userAgent?.trim() || 'unknown';
  const visitorHash = hashVisitor(ip, userAgent);
  const now = new Date();

  await prisma.visitorMetric.upsert({
    where: {
      visitorHash_bucketDate: {
        visitorHash,
        bucketDate: getDayBucket(now),
      },
    },
    update: {},
    create: {
      visitorHash,
      bucketDate: getDayBucket(now),
    },
  });
}

export async function getVisitorMetrics(now = new Date()) {
  const dayStart = getDayBucket(now);
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);

  const [dailyVisitors, weeklyGroups, monthlyGroups] = await Promise.all([
    prisma.visitorMetric.count({ where: { bucketDate: dayStart } }),
    prisma.visitorMetric.groupBy({
      by: ['visitorHash'],
      where: { bucketDate: { gte: weekStart } },
    }),
    prisma.visitorMetric.groupBy({
      by: ['visitorHash'],
      where: { bucketDate: { gte: monthStart } },
    }),
  ]);

  return {
    dailyVisitors,
    weeklyVisitors: weeklyGroups.length,
    monthlyVisitors: monthlyGroups.length,
  };
}
