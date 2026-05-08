import { prisma } from '@/lib/db';
import { expirePromotions } from '@/lib/promotions';

type PromotionMetricType = 'click' | 'impression';

type PromotionMetricState = {
  clickCounts: Map<string, number>;
  impressionCounts: Map<string, number>;
  flushTimer?: ReturnType<typeof setTimeout>;
  flushPromise?: Promise<void>;
  expirationSweepPromise?: Promise<void>;
  lastExpirationSweepAt: number;
};

const FLUSH_DELAY_MS = Number(process.env.PROMOTION_METRIC_QUEUE_FLUSH_MS ?? 5000);
const FLUSH_BATCH_SIZE = Number(process.env.PROMOTION_METRIC_QUEUE_BATCH_SIZE ?? 25);
const EXPIRATION_SWEEP_MS = Number(process.env.PROMOTION_EXPIRATION_SWEEP_MS ?? 60000);

const globalForPromotionMetrics = globalThis as typeof globalThis & {
  promotionMetricState?: PromotionMetricState;
};

function getState(): PromotionMetricState {
  if (!globalForPromotionMetrics.promotionMetricState) {
    globalForPromotionMetrics.promotionMetricState = {
      clickCounts: new Map(),
      impressionCounts: new Map(),
      lastExpirationSweepAt: 0,
    };
  }

  return globalForPromotionMetrics.promotionMetricState;
}

function queueSize(state: PromotionMetricState) {
  return state.clickCounts.size + state.impressionCounts.size;
}

export async function enqueuePromotionMetrics(type: PromotionMetricType, promotionIds: string[]) {
  if (!promotionIds.length) {
    return;
  }

  const state = getState();
  const target = type === 'click' ? state.clickCounts : state.impressionCounts;
  for (const promotionId of promotionIds) {
    target.set(promotionId, (target.get(promotionId) ?? 0) + 1);
  }

  if (queueSize(state) >= FLUSH_BATCH_SIZE) {
    await flushPromotionMetricsQueue();
    return;
  }

  if (!state.flushTimer) {
    state.flushTimer = setTimeout(() => {
      void flushPromotionMetricsQueue();
    }, FLUSH_DELAY_MS);
  }
}

export async function flushPromotionMetricsQueue() {
  const state = getState();

  if (state.flushPromise) {
    return state.flushPromise;
  }

  if (state.flushTimer) {
    clearTimeout(state.flushTimer);
    state.flushTimer = undefined;
  }

  const clickEntries = Array.from(state.clickCounts.entries());
  const impressionEntries = Array.from(state.impressionCounts.entries());
  state.clickCounts.clear();
  state.impressionCounts.clear();

  if (!clickEntries.length && !impressionEntries.length) {
    return;
  }

  state.flushPromise = (async () => {
    const updates = [
      ...clickEntries.map(([promotionId, count]) =>
        prisma.promotion.update({
          where: { id: promotionId },
          data: { clickCount: { increment: count } },
        }),
      ),
      ...impressionEntries.map(([promotionId, count]) =>
        prisma.promotion.update({
          where: { id: promotionId },
          data: { impressionCount: { increment: count } },
        }),
      ),
    ];

    if (!updates.length) {
      return;
    }

    try {
      await prisma.$transaction(updates);
    } catch (error) {
      console.error('[promotion-metrics-queue] failed to flush promotion metrics', error);
    }
  })().finally(() => {
    state.flushPromise = undefined;
  });

  return state.flushPromise;
}

export async function schedulePromotionExpirationSweep() {
  const state = getState();
  const now = Date.now();

  if (state.expirationSweepPromise) {
    return state.expirationSweepPromise;
  }

  if (now - state.lastExpirationSweepAt < EXPIRATION_SWEEP_MS) {
    return;
  }

  state.lastExpirationSweepAt = now;
  state.expirationSweepPromise = expirePromotions()
    .then(() => {})
    .catch((error) => {
      console.error('[promotion-metrics-queue] failed to expire promotions', error);
    })
    .finally(() => {
      state.expirationSweepPromise = undefined;
    });

  return state.expirationSweepPromise;
}
