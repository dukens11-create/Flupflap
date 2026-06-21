import crypto from 'crypto';
import { prisma } from '@/lib/db';

function getDayBucket(input: Date): Date {
  const day = new Date(input);
  day.setHours(0, 0, 0, 0);
  return day;
}

function getWeekStart(input: Date): Date {
  const weekStart = getDayBucket(input);
  // Calculate days back to Monday (ISO 8601 week start).
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  return weekStart;
}

function getMonthStart(input: Date): Date {
  return new Date(input.getFullYear(), input.getMonth(), 1);
}

function hashVisitor(ip: string, userAgent: string): string {
  const salt = process.env.TRAFFIC_HASH_SALT;
  if (!salt) {
    throw new Error('Missing TRAFFIC_HASH_SALT for visitor hashing.');
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

type VisitorMetricsDb = Pick<typeof prisma, 'visitorMetric'>;

export async function getVisitorMetrics(now = new Date(), db: VisitorMetricsDb = prisma) {
  const dayStart = getDayBucket(now);
  const weekStart = getWeekStart(now);
  const monthStart = getMonthStart(now);
  const lastTwelveMonthsStart = getDayBucket(now);
  lastTwelveMonthsStart.setFullYear(lastTwelveMonthsStart.getFullYear() - 1);

  try {
    const [dailyVisitors, weeklyGroups, monthlyGroups, yearlyGroups] = await Promise.all([
      db.visitorMetric.count({ where: { bucketDate: dayStart } }),
      db.visitorMetric.groupBy({
        by: ['visitorHash'],
        where: { bucketDate: { gte: weekStart } },
      }),
      db.visitorMetric.groupBy({
        by: ['visitorHash'],
        where: { bucketDate: { gte: monthStart } },
      }),
      db.visitorMetric.groupBy({
        by: ['visitorHash'],
        where: { bucketDate: { gte: lastTwelveMonthsStart } },
      }),
    ]);

    return {
      dailyVisitors,
      weeklyVisitors: weeklyGroups.length,
      monthlyVisitors: monthlyGroups.length,
      yearlyVisitors: yearlyGroups.length,
      errorMessage: null as string | null,
    };
  } catch (error) {
    console.error('[traffic] Failed to fetch visitor metrics for admin dashboard.', error);
    return {
      dailyVisitors: 0,
      weeklyVisitors: 0,
      monthlyVisitors: 0,
      yearlyVisitors: 0,
      errorMessage: 'Traffic analytics are temporarily unavailable. Showing 0 until data is restored.',
    };
  }
}
