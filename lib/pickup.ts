/**
 * Pickup code utilities for local pickup order confirmation.
 *
 * Flow:
 *   1. generatePickupCode() — returns a random 6-digit string.
 *   2. hashPickupCode(code) — bcrypt-hashes the code for safe DB storage.
 *   3. verifyPickupCode(code, hash) — constant-time comparison; returns true on match.
 *
 * The plain-text code is shown to the buyer in their order details.
 * The seller enters the code to confirm handoff; we verify against the hash.
 *
 * Security notes:
 *   - Codes use cryptographically secure RNG.
 *   - Codes are bcrypt-hashed before storage (cost 8 — fast for short codes).
 *   - The plain code is stored on the order row for display to the buyer and
 *     is never shown to sellers (they verify by entry, not by reading it).
 *   - Codes do not expire on a timer; they are invalidated when the order
 *     reaches PICKED_UP or CANCELLED status.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const BCRYPT_COST = 8;

/** Generate a cryptographically secure 6-digit pickup code. */
export function generatePickupCode(): string {
  // Produce a number in [0, 1_000_000), zero-padded to 6 digits.
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, '0');
}

/** Hash a pickup code for secure storage. */
export async function hashPickupCode(code: string): Promise<string> {
  return bcrypt.hash(code.trim(), BCRYPT_COST);
}

/** Verify a submitted code against the stored hash. */
export async function verifyPickupCode(
  code: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(code.trim(), hash);
}

/**
 * Haversine distance between two lat/lng pairs, in miles.
 * Returns null if any coordinate is missing or invalid.
 */
export function haversineDistanceMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3_958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
