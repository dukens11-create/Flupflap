import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import {
  enrollFoundingSeller,
  getFoundingSellerCount,
  isFoundingSellerProgramOpen,
  FOUNDING_SELLER_LIMIT,
} from '@/lib/founding-seller';

/**
 * GET /api/founding-seller/enroll
 *
 * Returns whether the program is still open and the current enrollment count.
 * No authentication required — used to power the UI before a user signs in.
 */
export async function GET() {
  try {
    const [isOpen, count] = await Promise.all([
      isFoundingSellerProgramOpen(),
      getFoundingSellerCount(),
    ]);

    return NextResponse.json({
      isOpen,
      enrolledCount: count,
      limit: FOUNDING_SELLER_LIMIT,
      spotsRemaining: Math.max(0, FOUNDING_SELLER_LIMIT - count),
    });
  } catch (err) {
    console.error('[founding-seller/enroll GET]', err);
    return NextResponse.json(
      { error: 'Failed to check program status.' },
      { status: 500 },
    );
  }
}

/**
 * POST /api/founding-seller/enroll
 *
 * Enrolls the signed-in user in the Founding Seller Program.
 * Requires authentication. Returns the founder number on success.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { error: 'You must be signed in to enroll.' },
        { status: 401 },
      );
    }

    const isOpen = await isFoundingSellerProgramOpen();
    if (!isOpen) {
      return NextResponse.json(
        {
          error:
            'The Founding Seller Program has reached its limit of 1,000 founders. ' +
            'Stay tuned for future seller plans.',
        },
        { status: 409 },
      );
    }

    const { foundingSellerNumber, expiryDate, enrollmentDate } =
      await enrollFoundingSeller(session.user.id);

    return NextResponse.json(
      {
        success: true,
        foundingSellerNumber,
        enrollmentDate,
        expiryDate,
        message: `Welcome, Founder #${foundingSellerNumber}! Your free year starts now.`,
      },
      { status: 201 },
    );
  } catch (err: any) {
    if (err?.message === 'PROGRAM_CLOSED') {
      return NextResponse.json(
        {
          error:
            'The Founding Seller Program has reached its limit of 1,000 founders.',
        },
        { status: 409 },
      );
    }
    console.error('[founding-seller/enroll POST]', err);
    return NextResponse.json(
      { error: 'Enrollment failed. Please try again.' },
      { status: 500 },
    );
  }
}
