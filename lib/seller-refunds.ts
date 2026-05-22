import type { Prisma, PrismaClient, SellerRefundHistory } from '@prisma/client';
import { prisma } from '@/lib/db';
import { isSchemaNotInitializedError } from '@/lib/db-errors';

type SellerRefundsDbClient = PrismaClient | Prisma.TransactionClient;

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

export type SellerRefundsData = {
  refundRequests: SellerRefundRequestRecord[];
  refundHistory: SellerRefundHistoryRecord[];
  refundRequestsFetchFailed: boolean;
  refundHistoryFetchFailed: boolean;
  refundHistorySchemaNotInitialized: boolean;
};

export async function getSellerRefundsData(
  sellerId: string,
  db: SellerRefundsDbClient = prisma,
): Promise<SellerRefundsData> {
  const [refundRequestsResult, refundHistoryResult] = await Promise.allSettled([
    db.refundRequest.findMany({
      ...sellerRefundRequestQuery,
      where: { sellerId },
    }),
    db.sellerRefundHistory.findMany({
      ...sellerRefundHistoryQuery,
      where: { sellerId },
    }),
  ]);

  let refundRequests: SellerRefundRequestRecord[] = [];
  let refundHistory: SellerRefundHistoryRecord[] = [];
  let refundRequestsFetchFailed = false;
  let refundHistoryFetchFailed = false;
  let refundHistorySchemaNotInitialized = false;

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
  } else {
    refundHistoryFetchFailed = true;
    refundHistorySchemaNotInitialized = isSchemaNotInitializedError(refundHistoryResult.reason);
    const logger = refundHistorySchemaNotInitialized ? console.warn : console.error;
    logger('[seller/refunds] Failed to load seller refund history', {
      sellerId,
      schemaNotInitialized: refundHistorySchemaNotInitialized,
      error: refundHistoryResult.reason,
    });
  }

  return {
    refundRequests,
    refundHistory,
    refundRequestsFetchFailed,
    refundHistoryFetchFailed,
    refundHistorySchemaNotInitialized,
  };
}
