/**
 * Founding Seller Program — service layer.
 *
 * The program offers the first 1,000 sellers a free 12-month subscription.
 * After year 1 they automatically transition to a paid plan unless they cancel.
 */

import { prisma } from '@/lib/db';

/** Hard cap on founding-seller enrollments. */
export const FOUNDING_SELLER_LIMIT = 1_000;

/** Duration of the free founding year in milliseconds. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1_000;

/**
 * Monthly fees (in cents) applied after the founding year expires.
 * Regular Seller is used as the default transition plan.
 */
export const GARAGE_SELLER_MONTHLY_FEE_CENTS = 399;  // $3.99
export const REGULAR_SELLER_MONTHLY_FEE_CENTS = 499; // $4.99

/** Returns true when the program is still accepting new enrollments. */
export async function isFoundingSellerProgramOpen(): Promise<boolean> {
  const count = await getFoundingSellerCount();
  return count < FOUNDING_SELLER_LIMIT;
}

/** Returns the current number of enrolled founding sellers. */
export async function getFoundingSellerCount(): Promise<number> {
  return prisma.foundingSellerProgram.count();
}

/**
 * Enrolls a user in the Founding Seller Program.
 *
 * - Assigns the next sequential founder number.
 * - Creates a `SellerSubscription` record with a $0 monthly fee.
 * - Is idempotent: calling again for an already-enrolled user returns the
 *   existing record without creating a duplicate.
 *
 * @throws {Error} when the program is full or the enrollment limit is reached.
 */
export async function enrollFoundingSeller(userId: string): Promise<{
  foundingSellerNumber: number;
  expiryDate: Date;
  enrollmentDate: Date;
}> {
  // Idempotency: return existing record if already enrolled.
  const existing = await prisma.foundingSellerProgram.findUnique({
    where: { userId },
    select: { foundingSellerNumber: true, expiryDate: true, enrollmentDate: true },
  });
  if (existing) return existing;

  // Use a transaction to safely claim the next founder number.
  return prisma.$transaction(async (tx) => {
    const count = await tx.foundingSellerProgram.count();
    if (count >= FOUNDING_SELLER_LIMIT) {
      throw new Error('PROGRAM_CLOSED');
    }

    const nextNumber = count + 1;
    const now = new Date();
    const expiryDate = new Date(now.getTime() + ONE_YEAR_MS);

    const record = await tx.foundingSellerProgram.create({
      data: {
        userId,
        foundingSellerNumber: nextNumber,
        enrollmentDate: now,
        expiryDate,
        status: 'ACTIVE',
        updatedAt: now,
      },
      select: { foundingSellerNumber: true, expiryDate: true, enrollmentDate: true },
    });

    // Create (or leave existing) SellerSubscription record.
    await tx.sellerSubscription.upsert({
      where: { userId },
      create: {
        userId,
        type: 'FOUNDING',
        status: 'ACTIVE',
        monthlyFeeCents: 0,
        nextBillingDate: expiryDate,
        updatedAt: now,
      },
      update: {}, // don't overwrite an existing subscription
    });

    return record;
  });
}

/** Returns true when the user has an active founding-seller enrollment. */
export async function isActiveFoundingSeller(userId: string): Promise<boolean> {
  const record = await prisma.foundingSellerProgram.findUnique({
    where: { userId },
    select: { status: true, expiryDate: true },
  });
  if (!record) return false;
  return record.status === 'ACTIVE' && record.expiryDate > new Date();
}

/**
 * Returns the founding seller details for a given user, or `null` when the
 * user has not enrolled.
 */
export async function getFoundingSellerDetails(userId: string): Promise<{
  foundingSellerNumber: number;
  enrollmentDate: Date;
  expiryDate: Date;
  status: string;
} | null> {
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
 * Transitions an expired founding-seller subscription to the Regular Seller
 * paid plan ($4.99/month).
 *
 * This is intended to be called by a cron job that runs nightly.
 *
 * @returns The updated `SellerSubscription` record, or `null` when the user
 *          has not enrolled / is already transitioned.
 */
export async function renewFoundingSellerSubscription(userId: string): Promise<{
  type: string;
  monthlyFeeCents: number;
  nextBillingDate: Date | null;
} | null> {
  const program = await prisma.foundingSellerProgram.findUnique({
    where: { userId },
    select: { status: true, expiryDate: true },
  });

  if (!program) return null;

  const now = new Date();

  // Only transition when the founding year has elapsed.
  if (program.expiryDate > now) return null;

  const nextBillingDate = new Date(now);
  nextBillingDate.setMonth(nextBillingDate.getMonth() + 1);

  return prisma.$transaction(async (tx) => {
    // Mark the program record as transitioned.
    await tx.foundingSellerProgram.update({
      where: { userId },
      data: { status: 'TRANSITIONED', updatedAt: now },
    });

    // Upgrade the subscription to Regular Seller.
    const sub = await tx.sellerSubscription.upsert({
      where: { userId },
      create: {
        userId,
        type: 'REGULAR_SELLER',
        status: 'ACTIVE',
        monthlyFeeCents: REGULAR_SELLER_MONTHLY_FEE_CENTS,
        nextBillingDate,
        updatedAt: now,
      },
      update: {
        type: 'REGULAR_SELLER',
        status: 'ACTIVE',
        monthlyFeeCents: REGULAR_SELLER_MONTHLY_FEE_CENTS,
        nextBillingDate,
        updatedAt: now,
      },
      select: { type: true, monthlyFeeCents: true, nextBillingDate: true },
    });

    return sub;
  });
}
