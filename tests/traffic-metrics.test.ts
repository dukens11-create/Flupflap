import test from 'node:test';
import assert from 'node:assert/strict';
import { getVisitorMetrics } from '@/lib/traffic';

test('getVisitorMetrics returns rolling yearly visitors for last 12 months', async () => {
  const now = new Date('2026-06-21T12:00:00.000Z');
  const groupByCalls: Array<{ where?: { bucketDate?: { gte?: Date } } }> = [];
  let callIndex = 0;
  const mockDb = {
    visitorMetric: {
      count: async () => 2,
      groupBy: async (args: { where?: { bucketDate?: { gte?: Date } } }) => {
        groupByCalls.push(args);
        callIndex += 1;
        if (callIndex === 1) return [{ visitorHash: 'a' }];
        if (callIndex === 2) return [{ visitorHash: 'a' }, { visitorHash: 'b' }];
        return [{ visitorHash: 'a' }, { visitorHash: 'b' }, { visitorHash: 'c' }];
      },
    },
  } as any;

  const result = await getVisitorMetrics(now, mockDb);

  assert.equal(result.dailyVisitors, 2);
  assert.equal(result.weeklyVisitors, 1);
  assert.equal(result.monthlyVisitors, 2);
  assert.equal(result.yearlyVisitors, 3);
  assert.equal(result.errorMessage, null);
  assert.equal(groupByCalls.length, 3);
  const expectedYearStart = new Date(now);
  expectedYearStart.setHours(0, 0, 0, 0);
  expectedYearStart.setFullYear(expectedYearStart.getFullYear() - 1);
  assert.equal(groupByCalls[2].where?.bucketDate?.gte?.toISOString(), expectedYearStart.toISOString());
});

test('getVisitorMetrics logs and returns fallback metrics when query fails', async () => {
  const originalConsoleError = console.error;
  const errorCalls: unknown[][] = [];
  console.error = (...args: unknown[]) => {
    errorCalls.push(args);
  };

  try {
    const mockDb = {
      visitorMetric: {
        count: async () => {
          throw new Error('db unavailable');
        },
        groupBy: async () => [],
      },
    } as any;

    const result = await getVisitorMetrics(new Date('2026-06-21T12:00:00.000Z'), mockDb);

    assert.equal(result.dailyVisitors, 0);
    assert.equal(result.weeklyVisitors, 0);
    assert.equal(result.monthlyVisitors, 0);
    assert.equal(result.yearlyVisitors, 0);
    assert.equal(result.errorMessage, 'Traffic analytics are temporarily unavailable. Showing 0 until data is restored.');
    assert.equal(errorCalls.length, 1);
    assert.equal(errorCalls[0][0], '[traffic] Failed to fetch visitor metrics for admin dashboard.');
  } finally {
    console.error = originalConsoleError;
  }
});
