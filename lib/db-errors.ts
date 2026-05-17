/**
 * Returns true when a Prisma/Postgres error indicates the schema has not been
 * applied yet (tables or columns are missing). This lets server pages show a
 * clear, actionable message instead of crashing to the global error boundary.
 *
 * Common causes: first deploy before Prisma migrations have been applied, or
 * DATABASE_URL points to a brand-new empty database. Also fires when a new
 * column was added to schema.prisma without a corresponding committed migration
 * (Prisma error code P2022 = column does not exist).
 */
export function isSchemaNotInitializedError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  // Prisma error codes: P2021 = table does not exist, P2022 = column does not exist
  const code = (err as { code?: string }).code;
  if (code === 'P2021' || code === 'P2022') return true;
  // Fallback: check the raw message for postgres "relation does not exist" text
  const msg = String((err as { message?: string }).message ?? '');
  return (
    /relation .+ does not exist/i.test(msg) ||
    /table .+ does not exist/i.test(msg) ||
    /column .+ does not exist/i.test(msg)
  );
}
