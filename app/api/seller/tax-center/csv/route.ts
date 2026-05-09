import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { computeTaxYearSummary } from '@/lib/tax-center';
import { buildTaxReportCsv } from '@/lib/tax-center';

export const dynamic = 'force-dynamic';

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
  const summary = await computeTaxYearSummary(sellerId, isNaN(taxYear) ? currentYear : taxYear);
  const csv = buildTaxReportCsv(summary);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="flupflap-tax-report-${summary.taxYear}.csv"`,
    },
  });
}
