import type { Role } from '@prisma/client';

// Keep buyer/seller/admin ordering stable for consistent serialization and comparisons.
const ROLE_ORDER: Role[] = ['CUSTOMER', 'SELLER', 'ADMIN'];

export function normalizeUserRoles(roles: Role[] | null | undefined, legacyRole: Role): Role[] {
  const unique = new Set<Role>();
  for (const role of roles ?? []) {
    unique.add(role);
  }
  if (unique.size === 0) {
    unique.add(legacyRole);
  }
  return ROLE_ORDER.filter((role) => unique.has(role));
}

export function addUserRole(roles: Role[] | null | undefined, legacyRole: Role, nextRole: Role): Role[] {
  const normalized = normalizeUserRoles(roles, legacyRole);
  if (!normalized.includes(nextRole)) {
    normalized.push(nextRole);
  }
  return ROLE_ORDER.filter((role) => normalized.includes(role));
}

export function hasUserRole(roles: Role[] | null | undefined, legacyRole: Role, expectedRole: Role): boolean {
  return normalizeUserRoles(roles, legacyRole).includes(expectedRole);
}

/**
 * Session-aware role check. Prefers the `roles` array when present (multi-role),
 * and falls back to the legacy `role` field for backward-compatible tokens/sessions.
 *
 * Use this instead of `session.user.role === 'SELLER'` in API route handlers.
 */
export function sessionHasRole(
  user: { role: Role; roles?: Role[] | null },
  expectedRole: Role,
): boolean {
  return hasUserRole(user.roles, user.role, expectedRole);
}
