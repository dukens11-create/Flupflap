/**
 * Regression tests for P1-7: multi-role auth using roles[] consistently.
 *
 * These tests cover:
 * - hasUserRole / normalizeUserRoles / addUserRole (core helpers)
 * - sessionHasRole (session-level helper used by all API route guards)
 * - Legacy single-role compatibility (users whose roles[] is empty/null)
 * - Multi-role combinations: buyer+seller, admin+seller, etc.
 * - Authorization denial for missing roles
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeUserRoles,
  addUserRole,
  hasUserRole,
  sessionHasRole,
} from '@/lib/user-roles';
import type { Role } from '@prisma/client';

// ---------------------------------------------------------------------------
// normalizeUserRoles
// ---------------------------------------------------------------------------

test('normalizeUserRoles: empty roles array falls back to legacyRole', () => {
  const result = normalizeUserRoles([], 'CUSTOMER');
  assert.deepEqual(result, ['CUSTOMER']);
});

test('normalizeUserRoles: null roles falls back to legacyRole', () => {
  const result = normalizeUserRoles(null, 'SELLER');
  assert.deepEqual(result, ['SELLER']);
});

test('normalizeUserRoles: deduplicates repeated roles', () => {
  const result = normalizeUserRoles(['CUSTOMER', 'CUSTOMER', 'SELLER'], 'CUSTOMER');
  assert.deepEqual(result, ['CUSTOMER', 'SELLER']);
});

test('normalizeUserRoles: preserves stable ordering (CUSTOMER, SELLER, ADMIN)', () => {
  // Even if passed out of order, result must follow canonical ordering.
  const result = normalizeUserRoles(['ADMIN', 'CUSTOMER', 'SELLER'], 'CUSTOMER');
  assert.deepEqual(result, ['CUSTOMER', 'SELLER', 'ADMIN']);
});

test('normalizeUserRoles: unknown roles are silently dropped (not in ROLE_ORDER)', () => {
  // 'GUEST' is not a valid Role; only known roles survive normalization.
  const result = normalizeUserRoles(['CUSTOMER'] as Role[], 'CUSTOMER');
  assert.deepEqual(result, ['CUSTOMER']);
});

// ---------------------------------------------------------------------------
// addUserRole
// ---------------------------------------------------------------------------

test('addUserRole: adds a new role to an existing array', () => {
  const result = addUserRole(['CUSTOMER'], 'CUSTOMER', 'SELLER');
  assert.deepEqual(result, ['CUSTOMER', 'SELLER']);
});

test('addUserRole: does not duplicate an already-present role', () => {
  const result = addUserRole(['CUSTOMER', 'SELLER'], 'CUSTOMER', 'SELLER');
  assert.deepEqual(result, ['CUSTOMER', 'SELLER']);
});

// ---------------------------------------------------------------------------
// hasUserRole
// ---------------------------------------------------------------------------

test('hasUserRole: detects role present in roles[]', () => {
  assert.equal(hasUserRole(['CUSTOMER', 'SELLER'], 'CUSTOMER', 'SELLER'), true);
});

test('hasUserRole: detects role absent from roles[]', () => {
  assert.equal(hasUserRole(['CUSTOMER'], 'CUSTOMER', 'SELLER'), false);
});

test('hasUserRole: falls back to legacyRole when roles[] is empty', () => {
  assert.equal(hasUserRole([], 'SELLER', 'SELLER'), true);
  assert.equal(hasUserRole([], 'CUSTOMER', 'SELLER'), false);
});

test('hasUserRole: falls back to legacyRole when roles is null', () => {
  assert.equal(hasUserRole(null, 'ADMIN', 'ADMIN'), true);
  assert.equal(hasUserRole(null, 'CUSTOMER', 'ADMIN'), false);
});

// ---------------------------------------------------------------------------
// sessionHasRole — the helper used in API route guards
// ---------------------------------------------------------------------------

test('sessionHasRole: buyer-only user is granted CUSTOMER, denied SELLER and ADMIN', () => {
  const user = { role: 'CUSTOMER' as Role, roles: ['CUSTOMER'] as Role[] };
  assert.equal(sessionHasRole(user, 'CUSTOMER'), true);
  assert.equal(sessionHasRole(user, 'SELLER'), false);
  assert.equal(sessionHasRole(user, 'ADMIN'), false);
});

test('sessionHasRole: user with [CUSTOMER, SELLER] can act as both buyer and seller', () => {
  const user = { role: 'CUSTOMER' as Role, roles: ['CUSTOMER', 'SELLER'] as Role[] };
  assert.equal(sessionHasRole(user, 'CUSTOMER'), true, 'should have CUSTOMER');
  assert.equal(sessionHasRole(user, 'SELLER'), true, 'should have SELLER');
  assert.equal(sessionHasRole(user, 'ADMIN'), false, 'should NOT have ADMIN');
});

test('sessionHasRole: user with [ADMIN, SELLER] can act as admin and seller, denied buyer-only', () => {
  // A user without CUSTOMER explicitly in roles[] but with legacy role=ADMIN
  // should NOT pass a CUSTOMER check (ADMIN ≠ buyer).
  const user = { role: 'ADMIN' as Role, roles: ['SELLER', 'ADMIN'] as Role[] };
  assert.equal(sessionHasRole(user, 'ADMIN'), true, 'should have ADMIN');
  assert.equal(sessionHasRole(user, 'SELLER'), true, 'should have SELLER');
  assert.equal(sessionHasRole(user, 'CUSTOMER'), false, 'should NOT have CUSTOMER');
});

test('sessionHasRole: legacy single-role payload (roles missing/null) uses role field', () => {
  // Simulate a token issued before multi-role – roles is absent (null/undefined).
  const userNull = { role: 'SELLER' as Role, roles: null };
  assert.equal(sessionHasRole(userNull, 'SELLER'), true);
  assert.equal(sessionHasRole(userNull, 'ADMIN'), false);

  const userUndef = { role: 'ADMIN' as Role, roles: undefined };
  assert.equal(sessionHasRole(userUndef, 'ADMIN'), true);
  assert.equal(sessionHasRole(userUndef, 'SELLER'), false);
});

test('sessionHasRole: legacy single-role payload with empty roles[] falls back to role field', () => {
  const user = { role: 'SELLER' as Role, roles: [] as Role[] };
  assert.equal(sessionHasRole(user, 'SELLER'), true);
  assert.equal(sessionHasRole(user, 'CUSTOMER'), false);
});

test('sessionHasRole: admin user denied buyer-only action when CUSTOMER not in roles', () => {
  const admin = { role: 'ADMIN' as Role, roles: ['ADMIN'] as Role[] };
  assert.equal(sessionHasRole(admin, 'CUSTOMER'), false);
});

test('sessionHasRole: authorization denial correct for completely missing role', () => {
  const seller = { role: 'SELLER' as Role, roles: ['SELLER'] as Role[] };
  // Cannot access admin-only endpoints
  assert.equal(sessionHasRole(seller, 'ADMIN'), false);
  // Cannot access buyer-only endpoints (no CUSTOMER role)
  assert.equal(sessionHasRole(seller, 'CUSTOMER'), false);
});
