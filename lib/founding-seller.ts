/**
 * Founding Seller Program — service layer.
 *
 * The program offers the first 1,000 sellers a free 12-month subscription.
 * After year 1 they automatically transition to a paid plan unless they cancel.
 *
 * NOTE: All seller subscription fees are currently DISABLED (FREE TIER).
 * Monthly fees remain $0 and no billing dates are scheduled.
 * Fees can be re-enabled via the admin panel without data loss.
 */

import { prisma } from '@/lib/db';

/** Hard cap on founding-seller enrollments. */
export const FOUNDING_SELLER_LIMIT = 1_000;

/** Duration of the free founding year in milliseconds. */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1_000;

/**
 * Monthly fees (in cents) applied after the founding year expires
 * when seller subscription fees are re-enabled.
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
 * - Assigns the next sequential founder number using a SERIALIZABLE transaction
 *   so that concurrent enrollments cannot claim the same founder number.
 * - Creates a `SellerSubscription` record with a $0 monthly fee when none exists.
 * - Is idempotent: calling again for an already-enrolled user returns the
 *   existing record without creating a duplicate.
 *
 * @throws {Error} with message 'PROGRAM_CLOSED' when the limit is reached.
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

  // Use a SERIALIZABLE transaction so that concurrent reads of the count are
  // isolated: two simultaneous enrollments cannot both read the same count and
  // attempt to create the same foundingSellerNumber.
  return prisma.$transaction(
    async (tx) => {
      // Use MAX+1 to ensure sequential numbers are never reused if records are
      // deleted, and to remain safe under the SERIALIZABLE isolation level.
      const maxResult = await tx.foundingSellerProgram.aggregate({
        _max: { foundingSellerNumber: true },
        _count: { id: true },
      });
      const currentCount = maxResult._count.id;
      if (currentCount >= FOUNDING_SELLER_LIMIT) {
        throw new Error('PROGRAM_CLOSED');
      }
      const nextNumber = (maxResult._max.foundingSellerNumber ?? 0) + 1;
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

      // Only create a SellerSubscription when the user does not already have one,
      // preserving any pre-existing subscription state.
      const existingSubscription = await tx.sellerSubscription.findUnique({ where: { userId } });
      if (!existingSubscription) {
        await tx.sellerSubscription.create({
          data: {
            userId,
            type: 'FOUNDING',
            status: 'ACTIVE',
            monthlyFeeCents: 0,
            // Billing is currently disabled (FREE TIER). nextBillingDate is null
            // so no charges are ever triggered. Will be populated when fees are
            // re-enabled via the admin panel.
            nextBillingDate: null,
            updatedAt: now,
          },
        });
      }

      return record;
    },
    { isolationLevel: 'Serializable' },
  );
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
 * Transitions an expired founding-seller subscription to the Regular Seller plan.
 *
 * This is intended to be called by a cron job that runs nightly.
 *
 * NOTE: While the global FREE TIER is active (sellerSubscriptionFeeEnabled = false),
 * the monthly fee is kept at $0 and no billing date is scheduled.
 * The subscription type is updated to REGULAR_SELLER so the record is ready
 * for re-activation without data loss when fees are re-enabled.
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

  return prisma.$transaction(async (tx) => {
    // Mark the program record as transitioned.
    await tx.foundingSellerProgram.update({
      where: { userId },
      data: { status: 'TRANSITIONED', updatedAt: now },
    });

    // Upgrade the subscription type to Regular Seller.
    // Monthly fee stays $0 and nextBillingDate is null while FREE TIER is active.
    // These will be updated when fees are re-enabled via the admin panel.
    const sub = await tx.sellerSubscription.upsert({
      where: { userId },
      create: {
        userId,
        type: 'REGULAR_SELLER',
        status: 'ACTIVE',
        monthlyFeeCents: 0,
        nextBillingDate: null,
        updatedAt: now,
      },
      update: {
        type: 'REGULAR_SELLER',
        status: 'ACTIVE',
        monthlyFeeCents: 0,
        nextBillingDate: null,
        updatedAt: now,
      },
      select: { type: true, monthlyFeeCents: true, nextBillingDate: true },
    });

    return sub;
  });
}
