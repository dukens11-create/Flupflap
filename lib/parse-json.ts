/**
 * Safely parse a JSON string. Returns the parsed value on success, or null if
 * the input is empty/undefined or not valid JSON.
 *
 * The return type uses `any` so it can be assigned directly to Prisma's
 * `InputJsonValue | NullableJsonNullValueInput` without explicit casting at
 * every call site.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseJsonOrNull(jsonString: string | undefined | null): any {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString);
  } catch {
    return null;
  }
}
