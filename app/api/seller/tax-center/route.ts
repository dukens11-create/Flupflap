import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/db';
import { Form1099Status, TaxIdStatus } from '@prisma/client';
import { computeTaxYearSummary, getSellerTaxYears } from '@/lib/tax-center';

/** Known Stripe Tax Form statuses for type-safe handling. */
type StripeTaxFormStatus = 'draft' | 'pending' | 'issued' | 'filed';

function toForm1099StatusFromStripe(stripeStatus: StripeTaxFormStatus): Form1099Status {
  switch (stripeStatus) {
    case 'filed': return Form1099Status.FILED;
    case 'issued': return Form1099Status.AVAILABLE;
    case 'pending': return Form1099Status.PENDING;
    default: return Form1099Status.NOT_ELIGIBLE;
  }
}

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
    let form1099EnumStatus: Form1099Status = Form1099Status.NOT_ELIGIBLE;
    let form1099DownloadUrl: string | null = null;

    const stripeAccountId = user?.stripeAccountId;
    if (stripeAccountId && user?.stripeOnboardingComplete) {
      try {
        // The Stripe Tax Forms API (/v1/tax/forms) is not yet included in the
        // stripe-node type definitions at the pinned API version (2024-06-20).
        // We call it directly via fetch to maintain full type safety without
        // resorting to unsafe `any` casts on the Stripe client object.
        type StripeTaxForm = {
          tax_year: number;
          status: StripeTaxFormStatus;
          pdf: string | null;
        };
        type StripeTaxFormsListResponse = {
          object: 'list';
          data: StripeTaxForm[];
        };

        const stripeKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();
        if (!stripeKey) {
          console.warn('[api/seller/tax-center] STRIPE_SECRET_KEY is not configured; skipping 1099-K lookup.');
        } else {
          const params = new URLSearchParams({
            'payee[type]': 'account',
            'payee[account]': stripeAccountId,
            type: '1099-K',
          });
          const res = await fetch(
            `https://api.stripe.com/v1/tax/forms?${params.toString()}`,
            {
              headers: {
                Authorization: `Bearer ${stripeKey}`,
                'Stripe-Version': '2024-06-20',
              },
            },
          );

          if (res.ok) {
            const taxForms = (await res.json()) as StripeTaxFormsListResponse;
            const form = taxForms?.data?.find(f => f.tax_year === taxYear);
            if (form) {
              form1099EnumStatus = toForm1099StatusFromStripe(form.status);
              form1099DownloadUrl = form.pdf ?? null;
            }
          } else {
            console.warn('[api/seller/tax-center] Stripe Tax Forms API returned', res.status);
          }
        }
      } catch (stripeErr) {
        // Stripe Tax Forms API may not be available in all environments or
        // may fail transiently; fall back gracefully to NOT_ELIGIBLE.
        console.warn('[api/seller/tax-center] Stripe Tax Forms API error:', stripeErr);
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
        form1099Status: form1099EnumStatus,
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
        form1099Status: form1099EnumStatus,
        form1099DownloadUrl,
      },
    });

    const availableYears = await getSellerTaxYears(sellerId);

    return NextResponse.json({
      taxProfile: {
        legalName: taxProfile.legalName,
        businessName: taxProfile.businessName,
        taxIdStatus: taxProfile.taxIdStatus,
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
        form1099Status: form1099EnumStatus,
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
