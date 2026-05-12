/**
 * Sentry server-side (Node.js) configuration.
 *
 * Loaded automatically for API routes, Server Components, and server actions.
 *
 * Required environment variable:
 *   SENTRY_DSN – Sentry Data Source Name from your project settings.
 *
 * Optional environment variables:
 *   SENTRY_ENVIRONMENT – e.g. "production", "staging" (defaults to NODE_ENV)
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,

  // Only enable in production or when DSN is explicitly configured.
  enabled: !!dsn,

  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Low sample rate for traces to keep costs manageable on Render's free tier.
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  // Strip sensitive information before it reaches Sentry.
  beforeSend(event) {
    // Remove authorization and cookie headers from request data.
    if (event.request?.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['authorization'];
      delete event.request.headers['x-auth-token'];
    }
    return event;
  },
});
