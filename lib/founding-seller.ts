import { prisma } from '@/lib/prisma';
import { nanoid } from 'nanoid';

const FOUNDING_SELLER_LIMIT = 1000;
const FOUNDING_SELLER_FREE_MONTHS = 12;
const GARAGE_SELLER_MONTHLY_FEE = 3.99;
const REGULAR_SELLER_MONTHLY_FEE = 4.99;

/**
 * Check if founding seller program is still accepting enrollments
 */
export async function isFoundingSellerProgramOpen(): Promise<boolean> {
  const count = await prisma.foundingSellerProgram.count({
    where: { status: 'ACTIVE' },
  });
  return count < FOUNDING_SELLER_LIMIT;
}

/**
 * Get current founding seller count
 */
export async function getFoundingSellerCount(): Promise<number> {
  return prisma.foundingSellerProgram.count({
    where: { status: 'ACTIVE' },
  });
}

/**
 * Enroll a user in the Founding Seller Program
 */
export async function enrollFoundingSeller(userId: string): Promise<{
  success: boolean;
  error?: string;
  foundingSellerNumber?: number;
}> {
  try {
    // Check if program is still open
    const isOpen = await isFoundingSellerProgramOpen();
    if (!isOpen) {
      return { success: false, error: 'Founding Seller Program is now closed' };
    }

    // Check if user already enrolled
    const existing = await prisma.foundingSellerProgram.findUnique({
      where: { userId },
    });
    if (existing) {
      return { success: false, error: 'User is already enrolled in Founding Seller Program' };
    }

    // Get next founding seller number
    const lastEnrolled = await prisma.foundingSellerProgram.findFirst({
      orderBy: { foundingSellerNumber: 'desc' },
    });
    const nextNumber = (lastEnrolled?.foundingSellerNumber || 0) + 1;

    // Create founding seller record
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);

    const foundingSeller = await prisma.foundingSellerProgram.create({
      data: {
        id: nanoid(),
        userId,
        foundingSellerNumber: nextNumber,
        expiryDate,
        status: 'ACTIVE',
      },
    });

    // Create associated seller subscription
    await prisma.sellerSubscription.create({
      data: {
        id: nanoid(),
        userId,
        type: 'FOUNDING',
        status: 'ACTIVE',
        monthlyFee: 0,
        nextBillingDate: expiryDate,
      },
    });

    // Update user's seller subscription reference
    await prisma.user.update({
      where: { id: userId },
      data: { isSeller: true },
    });

    return {
      success: true,
      foundingSellerNumber: nextNumber,
    };
  } catch (error) {
    console.error('[enrollFoundingSeller] Error:', error);
    return { success: false, error: 'Failed to enroll in Founding Seller Program' };
  }
}

/**
 * Check if user is an active founding seller
 */
export async function isActiveFoundingSeller(userId: string): Promise<boolean> {
  const foundingSeller = await prisma.foundingSellerProgram.findUnique({
    where: { userId },
  });
  return foundingSeller?.status === 'ACTIVE' && foundingSeller.expiryDate > new Date();
}

/**
 * Get founding seller details
 */
export async function getFoundingSellerDetails(userId: string) {
  return prisma.foundingSellerProgram.findUnique({
    where: { userId },
    select: {
      foundingSellerNumber: true,
      enrollmentDate: true,
      expiryDate: true,
      status: true,
    },
  });
}

/**
 * Handle founding seller subscription renewal
 * Called when 12 months are up
 */
export async function renewFoundingSellerSubscription(userId: string): Promise<{
  success: boolean;
  newSubscriptionType?: string;
  error?: string;
}> {
  try {
    const foundingSeller = await prisma.foundingSellerProgram.findUnique({
      where: { userId },
    });

    if (!foundingSeller) {
      return { success: false, error: 'User is not a founding seller' };
    }

    // Mark founding seller as expired
    await prisma.foundingSellerProgram.update({
      where: { userId },
      data: { status: 'EXPIRED' },
    });

    // Update subscription to Regular Seller
    const nextBillingDate = new Date();
    nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

    await prisma.sellerSubscription.update({
      where: { userId },
      data: {
        type: 'REGULAR_SELLER',
        monthlyFee: REGULAR_SELLER_MONTHLY_FEE,
        nextBillingDate,
      },
    });

    return {
      success: true,
      newSubscriptionType: 'REGULAR_SELLER',
    };
  } catch (error) {
    console.error('[renewFoundingSellerSubscription] Error:', error);
    return { success: false, error: 'Failed to renew subscription' };
  }
}
