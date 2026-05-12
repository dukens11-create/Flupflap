/**
 * Sentry browser (client-side) configuration.
 *
 * This file is loaded automatically by @sentry/nextjs when the SDK is
 * initialized in the browser. It is imported via the `instrumentation.ts`
 * entry point produced by withSentryConfig.
 *
 * Required environment variable:
 *   NEXT_PUBLIC_SENTRY_DSN – Sentry Data Source Name from your project settings.
 *
 * Optional environment variables:
 *   NEXT_PUBLIC_SENTRY_ENVIRONMENT – e.g. "production", "staging" (defaults to NODE_ENV)
 */

import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,

  // Only enable in production or when DSN is explicitly configured.
  enabled: !!dsn,

  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,

  // Capture 10% of performance traces in production (adjust as needed).
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Replay 1% of sessions, 100% of sessions where an error occurs.
  replaysSessionSampleRate: 0.01,
  replaysOnErrorSampleRate: 1.0,

  // Strip sensitive query params from breadcrumbs/URLs automatically.
  beforeBreadcrumb(breadcrumb) {
    if (breadcrumb.category === 'xhr' || breadcrumb.category === 'fetch') {
      const urlStr: string = breadcrumb.data?.url ?? '';
      // Never record auth API calls or external Stripe requests in breadcrumbs.
      try {
        // `new URL` requires an absolute URL. We supply a dummy base so that
        // relative paths (e.g. "/api/auth/session") are accepted as well.
        // Any truly malformed string throws and is caught below.
        const parsed = new URL(urlStr, 'https://placeholder.invalid');
        if (
          parsed.pathname.startsWith('/api/auth') ||
          parsed.hostname === 'api.stripe.com' ||
          parsed.hostname.endsWith('.stripe.com')
        ) {
          return null;
        }
      } catch {
        // Unparseable URL — drop the breadcrumb to be safe.
        return null;
      }
    }
    return breadcrumb;
  },

  // Remove PII from event payloads before sending.
  beforeSend(event) {
    // Strip any cookie headers from request data.
    if (event.request?.headers) {
      delete event.request.headers['cookie'];
      delete event.request.headers['authorization'];
    }
    return event;
  },
});
