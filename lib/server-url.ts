/**
 * Returns the server-side base URL for internal API calls.
 * Uses NEXTAUTH_URL (always set in production/Render) and falls back
 * to NEXT_PUBLIC_APP_URL and then localhost for local development.
 */
export function serverBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`
  );
}
