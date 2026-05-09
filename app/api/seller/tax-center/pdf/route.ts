import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeTaxYearSummary } from '@/lib/tax-center';

export const dynamic = 'force-dynamic';

function fmt(cents: number): string {
  return (cents / 100).toFixed(2);
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (session.user.role !== 'SELLER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get('year');
  const currentYear = new Date().getFullYear();
  const taxYear = yearParam ? parseInt(yearParam, 10) : currentYear;

  const sellerId = session.user.id;
  const summary = await computeTaxYearSummary(
    sellerId,
    isNaN(taxYear) ? currentYear : taxYear,
  );

  const sellerName = session.user.name ?? 'Seller';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FlupFlap Tax Report ${summary.taxYear}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #0f172a; background: #fff; padding: 48px; max-width: 720px; margin: 0 auto; }
    .logo { font-size: 24px; font-weight: 900; color: #b45309; letter-spacing: -0.5px; margin-bottom: 32px; }
    h1 { font-size: 22px; font-weight: 800; margin-bottom: 4px; }
    .subtitle { font-size: 14px; color: #64748b; margin-bottom: 36px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    th { text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 2px solid #e2e8f0; padding: 8px 0; }
    td { padding: 10px 0; border-bottom: 1px solid #f1f5f9; font-size: 15px; }
    td:last-child { text-align: right; font-weight: 600; }
    .section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-top: 36px; margin-bottom: 8px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
    .total-row td { font-size: 16px; font-weight: 800; border-top: 2px solid #0f172a; border-bottom: none; padding-top: 14px; }
    .disclaimer { margin-top: 48px; padding: 14px 16px; background: #fef9c3; border: 1px solid #fde68a; border-radius: 8px; font-size: 13px; color: #78350f; }
    .footer { margin-top: 48px; font-size: 12px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 24px; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="logo">FlupFlap</div>
  <h1>Annual Tax Statement — ${summary.taxYear}</h1>
  <p class="subtitle">Prepared for: ${sellerName}</p>

  <p class="section-title">Sales Summary</p>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th style="text-align:right">Amount (USD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Gross Sales</td>
        <td>$${fmt(summary.grossSalesCents)}</td>
      </tr>
      <tr>
        <td>Total Completed Orders</td>
        <td>${summary.totalOrders}</td>
      </tr>
      <tr>
        <td>Refunds</td>
        <td>−$${fmt(summary.refundsCents)}</td>
      </tr>
    </tbody>
  </table>

  <p class="section-title">Fees &amp; Deductions</p>
  <table>
    <tbody>
      <tr>
        <td>FlupFlap Commission Fees</td>
        <td>−$${fmt(summary.marketplaceFeesCents)}</td>
      </tr>
      <tr>
        <td>Stripe / Payment Fees (estimate)</td>
        <td>−$${fmt(summary.paymentFeesCents)}</td>
      </tr>
    </tbody>
  </table>

  <p class="section-title">Payout &amp; Tax</p>
  <table>
    <tbody>
      <tr>
        <td>Net Payout Estimate</td>
        <td>$${fmt(summary.netPayoutsCents)}</td>
      </tr>
      <tr>
        <td>Sales Tax Collected</td>
        <td>$${fmt(summary.salesTaxCollectedCents)}</td>
      </tr>
    </tbody>
  </table>

  <div class="disclaimer">
    <strong>Disclaimer:</strong> FlupFlap does not provide tax advice. The figures above are
    based on platform data and are provided for your reference only. Payment processing fee
    estimates use the Stripe standard rate (2.9% + $0.30/transaction) and may differ from
    actual charges. Sellers should consult a qualified tax professional for filing guidance.
    1099-K forms (where required) are generated and filed through Stripe Connect.
  </div>

  <div class="footer">
    FlupFlap Marketplace &middot; Tax Statement for Tax Year ${summary.taxYear} &middot; Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="flupflap-tax-statement-${summary.taxYear}.html"`,
    },
  });
}
