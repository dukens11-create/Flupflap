/**
 * Tax center helpers — yearly aggregation of seller order/payment/refund data.
 */
import { prisma } from '@/lib/db';

export type TaxYearSummary = {
  taxYear: number;
  grossSalesCents: number;
  totalOrders: number;
  refundsCents: number;
  marketplaceFeesCents: number;
  paymentFeesCents: number;
  netPayoutsCents: number;
  salesTaxCollectedCents: number;
};

/**
 * Stripe standard payment processing rate used for fee estimates.
 * These are informational estimates only — actual charges may differ.
 */
const STRIPE_PROCESSING_PERCENT = 0.029; // 2.9%
const STRIPE_PROCESSING_FIXED_CENTS = 30; // $0.30 per transaction

/**
 * Compute a tax year summary by aggregating live order data for a seller.
 * All amounts are in cents.
 *
 * Gross sales   = sum of subtotalCents for completed/paid orders in the year.
 * Refunds       = sum of subtotalCents for REFUNDED orders in the year.
 * Marketplace fees = sum of platformFeeCents from those orders.
 * Net payouts   = sum of sellerPayoutCents from completed/paid orders.
 * Sales tax     = sum of taxCents from completed/paid orders.
 * Payment fees  = estimated at 2.9% + $0.30 per order (Stripe standard rate),
 *                 surfaced as an informational estimate only.
 */
export async function computeTaxYearSummary(
  sellerId: string,
  taxYear: number,
): Promise<TaxYearSummary> {
  const startOfYear = new Date(taxYear, 0, 1);
  const startOfNextYear = new Date(taxYear + 1, 0, 1);

  const COMPLETED_STATUSES = [
    'PAID',
    'SHIPPED',
    'DELIVERED',
    'READY_FOR_PICKUP',
    'PICKED_UP',
  ] as const;

  // Find all orders for this seller via OrderItem → Product → sellerId
  // We use a raw aggregation via nested selects to avoid huge data pulls.
  const [completedRows, refundRows] = await Promise.all([
    prisma.order.findMany({
      where: {
        createdAt: { gte: startOfYear, lt: startOfNextYear },
        status: { in: [...COMPLETED_STATUSES] },
        items: {
          some: {
            product: { sellerId },
          },
        },
      },
      select: {
        subtotalCents: true,
        taxCents: true,
        platformFeeCents: true,
        sellerPayoutCents: true,
        totalCents: true,
      },
    }),
    prisma.order.findMany({
      where: {
        createdAt: { gte: startOfYear, lt: startOfNextYear },
        status: 'REFUNDED',
        items: {
          some: {
            product: { sellerId },
          },
        },
      },
      select: {
        subtotalCents: true,
        platformFeeCents: true,
        sellerPayoutCents: true,
      },
    }),
  ]);

  let grossSalesCents = 0;
  let marketplaceFeesCents = 0;
  let netPayoutsCents = 0;
  let salesTaxCollectedCents = 0;

  for (const o of completedRows) {
    grossSalesCents += o.subtotalCents;
    marketplaceFeesCents += o.platformFeeCents;
    netPayoutsCents += o.sellerPayoutCents;
    salesTaxCollectedCents += o.taxCents;
  }

  let refundsCents = 0;
  for (const o of refundRows) {
    refundsCents += o.subtotalCents;
  }

  // Stripe standard processing fee estimate: 2.9% + $0.30 per transaction
  const paymentFeesCents =
    completedRows.length > 0
      ? Math.round(
          grossSalesCents * STRIPE_PROCESSING_PERCENT +
            completedRows.length * STRIPE_PROCESSING_FIXED_CENTS,
        )
      : 0;

  return {
    taxYear,
    grossSalesCents,
    totalOrders: completedRows.length,
    refundsCents,
    marketplaceFeesCents,
    paymentFeesCents,
    netPayoutsCents,
    salesTaxCollectedCents,
  };
}

/**
 * Return the list of years in which the seller had any completed order.
 * Always includes the current year so the selector always shows at least one option.
 */
export async function getSellerTaxYears(sellerId: string): Promise<number[]> {
  const currentYear = new Date().getFullYear();

  const orders = await prisma.order.findMany({
    where: {
      status: {
        in: [
          'PAID',
          'SHIPPED',
          'DELIVERED',
          'READY_FOR_PICKUP',
          'PICKED_UP',
          'REFUNDED',
        ],
      },
      items: {
        some: {
          product: { sellerId },
        },
      },
    },
    select: { createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  const yearSet = new Set<number>([currentYear]);
  for (const o of orders) {
    yearSet.add(o.createdAt.getFullYear());
  }

  return Array.from(yearSet).sort((a, b) => b - a); // descending
}

/**
 * Build CSV rows for a yearly tax report.
 */
export function buildTaxReportCsv(summary: TaxYearSummary): string {
  const fmt = (cents: number) => (cents / 100).toFixed(2);

  const rows: string[][] = [
    ['FlupFlap Seller Tax Report', '', ''],
    ['Tax Year', String(summary.taxYear), ''],
    ['', '', ''],
    ['Metric', 'Amount (USD)', 'Notes'],
    ['Gross Sales', `$${fmt(summary.grossSalesCents)}`, 'Before fees/refunds'],
    ['Total Orders', String(summary.totalOrders), 'Completed orders'],
    ['Refunds', `-$${fmt(summary.refundsCents)}`, 'Refunded order subtotals'],
    [
      'FlupFlap Commission Fees',
      `-$${fmt(summary.marketplaceFeesCents)}`,
      'Platform commission',
    ],
    [
      'Stripe / Payment Fees (est.)',
      `-$${fmt(summary.paymentFeesCents)}`,
      '2.9% + $0.30 per order estimate',
    ],
    ['Net Payout Estimate', `$${fmt(summary.netPayoutsCents)}`, 'After fees'],
    [
      'Sales Tax Collected',
      `$${fmt(summary.salesTaxCollectedCents)}`,
      'Collected on behalf of buyer',
    ],
    ['', '', ''],
    [
      'Disclaimer',
      'FlupFlap does not provide tax advice.',
      'Consult a tax professional.',
    ],
  ];

  return rows
    .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
}
