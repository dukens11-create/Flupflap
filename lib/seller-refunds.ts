import type { Prisma, PrismaClient, SellerRefundHistory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isSchemaNotInitializedError } from '@/lib/db-errors';

type SellerRefundsDbClient = PrismaClient | Prisma.TransactionClient;
type SellerRefundsDbDelegates = {
  refundRequest?: {
    findMany(args: Prisma.RefundRequestFindManyArgs): Promise<SellerRefundRequestRecord[]>;
  };
  sellerRefundHistory?: {
    findMany(args: Prisma.SellerRefundHistoryFindManyArgs): Promise<SellerRefundHistoryRecord[]>;
  };
  order?: {
    findMany(args: Prisma.OrderFindManyArgs): Promise<SellerRefundHistoryOrderRecord[]>;
  };
};

const sellerRefundRequestQuery = {
  include: {
    order: {
      select: {
        id: true,
        status: true,
        totalCents: true,
        buyer: {
          select: {
            name: true,
            email: true,
          },
        },
        items: {
          select: {
            quantity: true,
            product: {
              select: {
                title: true,
              },
            },
          },
        },
      },
    },
  },
  orderBy: { createdAt: 'desc' as const },
} satisfies Prisma.RefundRequestFindManyArgs;

const sellerRefundHistoryQuery = {
  orderBy: { createdAt: 'desc' as const },
  take: 100,
} satisfies Prisma.SellerRefundHistoryFindManyArgs;
const REFUND_STATUS_REQUESTED = 'REQUESTED';
const FALLBACK_REFUND_TYPE = 'order_refund_request';
const FALLBACK_SOURCE_LABEL = 'Order refund request';

type SellerRefundRequestRecord = Prisma.RefundRequestGetPayload<typeof sellerRefundRequestQuery>;
type SellerRefundHistoryRecord = SellerRefundHistory;
type SellerRefundHistoryOrderRecord = {
  id: string;
  status: string;
  buyer: {
    name: string | null;
    email: string;
  };
  items: Array<{
    quantity: number;
    product: {
      title: string;
    };
  }>;
};

export type SellerRefundsData = {
  refundRequests: SellerRefundRequestRecord[];
  refundHistory: Array<SellerRefundHistoryRecord & {
    order: SellerRefundHistoryOrderRecord | null;
  }>;
  refundRequestsFetchFailed: boolean;
  refundHistoryFetchFailed: boolean;
  refundHistoryFetchError: string | null;
};

function getUnavailableSellerRefundsError(subject: 'refund requests' | 'refund history' | 'order details') {
  return new Error(`Seller ${subject} are unavailable in this environment.`);
}

function fallbackHistoryFromRefundRequests(
  sellerId: string,
  refundRequests: SellerRefundRequestRecord[],
): Array<SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null }> {
  const isHistoryVisibleStatus = (status: SellerRefundRequestRecord['status']): boolean => status !== REFUND_STATUS_REQUESTED;
  const resolveFallbackAmountCents = (request: SellerRefundRequestRecord): number => {
    if (request.approvedAmountCents !== null) return request.approvedAmountCents;
    if (request.status === 'REFUNDED' && request.stripeRefundAmount !== null) return request.stripeRefundAmount;
    return request.requestedAmountCents;
  };

  return refundRequests
    .filter((request) => isHistoryVisibleStatus(request.status))
    .map((request) => ({
      id: `refund_request:${request.id}`,
      sellerId,
      orderId: request.orderId,
      saleId: null,
      refundType: FALLBACK_REFUND_TYPE,
      sourceLabel: FALLBACK_SOURCE_LABEL,
      sourceKey: `refund_request:${request.id}`,
      stripePaymentIntentId: null,
      stripeRefundId: request.stripeRefundId,
      amountCents: resolveFallbackAmountCents(request),
      currency: request.stripeRefundCurrency ?? null,
      status: request.stripeRefundStatus ?? request.status,
      reason: request.reason,
      refundedAt: request.stripeRefundCreatedAt ?? request.resolvedAt,
      resolvedAt: request.resolvedAt,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      order: request.order
        ? {
            id: request.order.id,
            status: request.order.status,
            buyer: request.order.buyer,
            items: request.order.items,
          }
        : null,
    }));
}

function mergeRefundHistory(
  sellerHistory: Array<SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null }>,
  fallbackHistory: Array<SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null }>,
): Array<SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null }> {
  const isDuplicate = (
    existing: SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null },
    candidate: SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null },
  ): boolean => {
    if (existing.sourceKey === candidate.sourceKey) return true;
    if (existing.stripeRefundId && candidate.stripeRefundId && existing.stripeRefundId === candidate.stripeRefundId) return true;
    if (existing.orderId !== null && candidate.orderId !== null && existing.orderId === candidate.orderId) {
      return existing.status.toLowerCase() === candidate.status.toLowerCase();
    }
    if (existing.saleId !== null && candidate.saleId !== null && existing.saleId === candidate.saleId) {
      return existing.status.toLowerCase() === candidate.status.toLowerCase();
    }
    return false;
  };

  const merged = [...sellerHistory];
  for (const fallbackEntry of fallbackHistory) {
    if (!merged.some((entry) => isDuplicate(entry, fallbackEntry))) {
      merged.push(fallbackEntry);
    }
  }

  return merged.sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

export async function getSellerRefundsData(
  sellerId: string,
  db: SellerRefundsDbClient = prisma,
): Promise<SellerRefundsData> {
  const sellerRefundsDb = db as SellerRefundsDbClient & SellerRefundsDbDelegates;
  const [refundRequestsResult, refundHistoryResult] = await Promise.allSettled([
    sellerRefundsDb.refundRequest?.findMany({
      ...sellerRefundRequestQuery,
      where: { sellerId },
    }) ?? Promise.reject(getUnavailableSellerRefundsError('refund requests')),
    sellerRefundsDb.sellerRefundHistory?.findMany({
      ...sellerRefundHistoryQuery,
      where: { sellerId },
    }) ?? Promise.reject(getUnavailableSellerRefundsError('refund history')),
  ]);

  let refundRequests: SellerRefundRequestRecord[] = [];
  let refundHistory: SellerRefundHistoryRecord[] = [];
  let refundHistoryWithOrder: Array<SellerRefundHistoryRecord & { order: SellerRefundHistoryOrderRecord | null }> = [];
  let refundRequestsFetchFailed = false;
  let refundHistoryFetchFailed = false;
  let refundHistoryFetchError: string | null = null;

  if (refundRequestsResult.status === 'fulfilled') {
    refundRequests = refundRequestsResult.value;
  } else {
    refundRequestsFetchFailed = true;
    console.error('[seller/refunds] Failed to load seller refund requests', {
      sellerId,
      error: refundRequestsResult.reason,
    });
  }

  if (refundHistoryResult.status === 'fulfilled') {
    refundHistory = refundHistoryResult.value;
    const orderIds = Array.from(new Set(refundHistory
      .map((entry) => entry.orderId)
      .filter((orderId): orderId is string => orderId != null && orderId !== '')));

    if (orderIds.length > 0) {
      try {
        if (!sellerRefundsDb.order?.findMany) {
          throw getUnavailableSellerRefundsError('order details');
        }
        const orders = await sellerRefundsDb.order.findMany({
          where: {
            id: { in: orderIds },
          },
          select: {
            id: true,
            status: true,
            buyer: {
              select: {
                name: true,
                email: true,
              },
            },
            items: {
              select: {
                quantity: true,
                product: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        });
        const orderById = new Map(orders.map((order) => [order.id, order]));
        refundHistoryWithOrder = refundHistory.map((entry) => ({
          ...entry,
          order: entry.orderId ? (orderById.get(entry.orderId) ?? null) : null,
        }));
      } catch (orderLookupError) {
        console.error('[seller/refunds] Failed to load order details for refund history', {
          sellerId,
          error: orderLookupError,
        });
        refundHistoryWithOrder = refundHistory.map((entry) => ({
          ...entry,
          order: null,
        }));
      }
    } else {
      refundHistoryWithOrder = refundHistory.map((entry) => ({
        ...entry,
        order: null,
      }));
    }
    if (!refundRequestsFetchFailed) {
      refundHistoryWithOrder = mergeRefundHistory(
        refundHistoryWithOrder,
        fallbackHistoryFromRefundRequests(sellerId, refundRequests),
      );
    }
  } else {
    refundHistoryFetchFailed = true;
    const schemaNotInitialized = isSchemaNotInitializedError(refundHistoryResult.reason);
    const logger = schemaNotInitialized ? console.warn : console.error;
    refundHistoryFetchError = schemaNotInitialized
      ? 'Refund history data is unavailable because database migrations are not fully applied.'
      : 'Refund history query failed due to a backend or network error.';
    logger('[seller/refunds] Failed to load seller refund history', {
      sellerId,
      schemaNotInitialized,
      cause: schemaNotInitialized ? 'schema_not_initialized' : 'query_failed',
      error: refundHistoryResult.reason,
    });

    if (!refundRequestsFetchFailed) {
      refundHistoryWithOrder = fallbackHistoryFromRefundRequests(sellerId, refundRequests);
      refundHistoryFetchFailed = false;
      console.warn('[seller/refunds] Using refund request data as fallback refund history', {
        sellerId,
        fallbackCount: refundHistoryWithOrder.length,
      });
    }
  }

  return {
    refundRequests,
    refundHistory: refundHistoryWithOrder,
    refundRequestsFetchFailed,
    refundHistoryFetchFailed,
    refundHistoryFetchError,
  };
}
