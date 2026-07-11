import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { enrollFoundingSeller, isFoundingSellerProgramOpen } from '@/lib/founding-seller';

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { ok: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Check if program is still open
    const isOpen = await isFoundingSellerProgramOpen();
    if (!isOpen) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Founding Seller Program enrollment is now closed. We reached the 1,000 seller limit!',
        },
        { status: 400 }
      );
    }

    // Enroll user
    const result = await enrollFoundingSeller(session.user.id);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: 'Successfully enrolled in Founding Seller Program',
      foundingSellerNumber: result.foundingSellerNumber,
    });
  } catch (error) {
    console.error('[founding-seller/enroll] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const isOpen = await isFoundingSellerProgramOpen();
    return NextResponse.json({ ok: true, isOpen });
  } catch (error) {
    console.error('[founding-seller/enroll] GET Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
