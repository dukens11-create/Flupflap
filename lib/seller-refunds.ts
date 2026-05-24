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

type SellerRefundRequestRecord = Prisma.RefundRequestGetPayload<typeof sellerRefundRequestQuery>;
type SellerRefundHistoryRecord = SellerRefundHistory;
type SellerRefundHistoryOrderRecord = {
  id: string;
  status: string;
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
};

function getUnavailableSellerRefundsError(subject: 'refund requests' | 'refund history' | 'order details') {
  return new Error(`Seller ${subject} are unavailable in this environment.`);
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
  } else {
    refundHistoryFetchFailed = true;
    const schemaNotInitialized = isSchemaNotInitializedError(refundHistoryResult.reason);
    const logger = schemaNotInitialized ? console.warn : console.error;
    logger('[seller/refunds] Failed to load seller refund history', {
      sellerId,
      schemaNotInitialized,
      error: refundHistoryResult.reason,
    });
  }

  return {
    refundRequests,
    refundHistory: refundHistoryWithOrder,
    refundRequestsFetchFailed,
    refundHistoryFetchFailed,
  };
}
