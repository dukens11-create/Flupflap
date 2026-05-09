import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { computeTaxYearSummary, getSellerTaxYears } from '@/lib/tax-center';
import { stripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (session.user.role !== 'SELLER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sellerId = session.user.id;
    const { searchParams } = new URL(req.url);
    const yearParam = searchParams.get('year');
    const currentYear = new Date().getFullYear();
    const requestedYear = yearParam ? parseInt(yearParam, 10) : currentYear;
    const taxYear = isNaN(requestedYear) ? currentYear : requestedYear;

    // Fetch user for Stripe Connect account ID
    const user = await prisma.user.findUnique({
      where: { id: sellerId },
      select: {
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        sellerTaxProfile: true,
      },
    });

    // Fetch seller verification for address/status
    const verification = await prisma.sellerVerification.findUnique({
      where: { sellerId },
      select: {
        status: true,
        street: true,
        city: true,
        state: true,
        zipCode: true,
        country: true,
      },
    });

    // Build or retrieve tax profile
    let taxProfile = user?.sellerTaxProfile ?? null;

    // If no profile exists, we create an empty one as a placeholder
    if (!taxProfile) {
      taxProfile = await prisma.sellerTaxProfile.upsert({
        where: { sellerId },
        create: {
          sellerId,
          verificationStatus: verification?.status ?? null,
          addressLine1: verification?.street ?? null,
          city: verification?.city ?? null,
          state: verification?.state ?? null,
          postalCode: verification?.zipCode ?? null,
          country: verification?.country ?? null,
        },
        update: {
          verificationStatus: verification?.status ?? null,
        },
      });
    }

    // Compute live tax year summary
    const summary = await computeTaxYearSummary(sellerId, taxYear);

    // Try to retrieve 1099-K info from Stripe if connected
    let form1099Status: string = 'NOT_ELIGIBLE';
    let form1099DownloadUrl: string | null = null;

    const stripeAccountId = user?.stripeAccountId;
    if (stripeAccountId && user?.stripeOnboardingComplete) {
      try {
        // Stripe Tax Forms API: list 1099-K forms for this connected account
        // The forms endpoint is available on Stripe Connect accounts.
        const taxForms = await (stripe as any).tax.forms.list({
          payee: { type: 'account', account: stripeAccountId },
          type: '1099-K',
        });

        const form = taxForms?.data?.find(
          (f: any) => f.tax_year === taxYear,
        );

        if (form) {
          if (form.status === 'filed') {
            form1099Status = 'FILED';
          } else if (form.status === 'issued') {
            form1099Status = 'AVAILABLE';
          } else if (form.status === 'pending') {
            form1099Status = 'PENDING';
          }
          // Download URL (if available in the form object)
          form1099DownloadUrl = form.pdf ?? null;
        }
      } catch {
        // Stripe Tax Forms API may not be available in all environments;
        // fall back gracefully to NOT_ELIGIBLE.
      }
    }

    // Persist the report snapshot for caching/audit
    await prisma.sellerTaxReport.upsert({
      where: { sellerId_taxYear: { sellerId, taxYear } },
      create: {
        sellerId,
        taxYear,
        grossSalesCents: summary.grossSalesCents,
        totalOrders: summary.totalOrders,
        refundsCents: summary.refundsCents,
        marketplaceFeesCents: summary.marketplaceFeesCents,
        paymentFeesCents: summary.paymentFeesCents,
        netPayoutsCents: summary.netPayoutsCents,
        salesTaxCollectedCents: summary.salesTaxCollectedCents,
        form1099Status: form1099Status as any,
        form1099DownloadUrl,
      },
      update: {
        grossSalesCents: summary.grossSalesCents,
        totalOrders: summary.totalOrders,
        refundsCents: summary.refundsCents,
        marketplaceFeesCents: summary.marketplaceFeesCents,
        paymentFeesCents: summary.paymentFeesCents,
        netPayoutsCents: summary.netPayoutsCents,
        salesTaxCollectedCents: summary.salesTaxCollectedCents,
        form1099Status: form1099Status as any,
        form1099DownloadUrl,
      },
    });

    const availableYears = await getSellerTaxYears(sellerId);

    return NextResponse.json({
      taxProfile: {
        legalName: taxProfile.legalName,
        businessName: taxProfile.businessName,
        taxIdStatus: taxProfile.taxIdStatus ?? 'NOT_PROVIDED',
        addressLine1: taxProfile.addressLine1,
        addressLine2: taxProfile.addressLine2,
        city: taxProfile.city,
        state: taxProfile.state,
        postalCode: taxProfile.postalCode,
        country: taxProfile.country,
        stripeAccountId: stripeAccountId ?? null,
        verificationStatus: taxProfile.verificationStatus,
      },
      summary: {
        ...summary,
        form1099Status,
        form1099DownloadUrl,
      },
      availableYears,
    });
  } catch (err) {
    console.error('[api/seller/tax-center] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
