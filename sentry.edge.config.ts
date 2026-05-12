/**
 * Sentry edge runtime configuration (used by Next.js Middleware).
 *
 * Required environment variable:
 *   SENTRY_DSN – Sentry Data Source Name from your project settings.
 */

import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
});
