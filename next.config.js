// @ts-check
const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: { remotePatterns: [{ protocol: 'https', hostname: '**' }] },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'off' },
        ],
      },
    ];
  },
};

module.exports = withSentryConfig(nextConfig, {
  // Sentry organization and project (set these in your CI/Render environment).
  // If SENTRY_ORG / SENTRY_PROJECT are not set, source-map upload is skipped
  // gracefully — the app still works and events are still captured.
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Auth token for source-map upload (SENTRY_AUTH_TOKEN env var).
  // Leave unset in development; required for source maps in production.
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Suppress verbose Sentry CLI output in CI logs.
  silent: !process.env.CI,

  // Disable source-map upload when the auth token is absent — this prevents
  // build failures when Sentry is not yet configured.
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  webpack: {
    // Automatically instrument Server Components and API routes.
    autoInstrumentServerFunctions: true,
    // Remove Sentry debug logging from production bundles.
    treeshake: {
      removeDebugLogging: process.env.NODE_ENV === 'production',
    },
  },
});
