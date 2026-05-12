/**
 * Structured server-side logger for FlupFlap.
 *
 * Why this exists
 * ---------------
 * Render aggregates Node.js stdout/stderr into its log stream. This module
 * produces consistent, machine-readable log lines that make operational
 * debugging fast:
 *
 *   [INFO]  [checkout/POST] Stripe checkout session created  { orderId: "...", userId: "..." }
 *   [ERROR] [seller/products/POST] Prisma write error        { action: "createProduct", ... }
 *
 * Rules
 * -----
 * - Never log raw secrets, tokens, passwords, or full card numbers.
 * - Never log raw PII (email, phone, full name) unless the severity is
 *   ERROR and the value has been masked by the caller.
 * - Always include a `tag` (the calling module / route) so grep can find it.
 *
 * Sentry integration
 * ------------------
 * When SENTRY_DSN is set, exceptions are also forwarded to Sentry via the
 * @sentry/nextjs SDK so that stack traces and breadcrumbs appear in the
 * Sentry dashboard.
 */

import * as Sentry from '@sentry/nextjs';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  /** Route or module that produced the log, e.g. "checkout/POST". */
  tag: string;
  /** Arbitrary structured metadata — must not contain secrets or raw PII. */
  [key: string]: unknown;
}

const LEVEL_LABELS: Record<LogLevel, string> = {
  debug: '[DEBUG]',
  info: '[INFO] ',
  warn: '[WARN] ',
  error: '[ERROR]',
};

function isSentryEnabled(): boolean {
  return !!process.env.SENTRY_DSN;
}

function format(level: LogLevel, message: string, ctx: LogContext): string {
  const { tag, ...rest } = ctx;
  const meta = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
  return `${LEVEL_LABELS[level]} [${tag}] ${message}${meta}`;
}

/** Log a debug-level message (suppressed in production unless DEBUG=true). */
export function logDebug(message: string, ctx: LogContext): void {
  if (process.env.NODE_ENV === 'production' && process.env.DEBUG !== 'true') return;
  console.debug(format('debug', message, ctx));
}

/** Log an informational message. */
export function logInfo(message: string, ctx: LogContext): void {
  console.info(format('info', message, ctx));
}

/** Log a warning. */
export function logWarn(message: string, ctx: LogContext): void {
  console.warn(format('warn', message, ctx));
}

/**
 * Log an error and optionally capture it in Sentry.
 *
 * @param message   Human-readable description of what failed.
 * @param err       The thrown value (may be an Error or an unknown shape).
 * @param ctx       Structured metadata to attach to the log and Sentry event.
 */
export function logError(message: string, err: unknown, ctx: LogContext): void {
  const errMessage = err instanceof Error ? err.message : String(err);
  const errName = err instanceof Error ? err.name : 'UnknownError';

  // Console output for Render log stream.
  console.error(format('error', message, { ...ctx, errName, errMessage }));

  // Stack trace on a separate line so it does not corrupt the structured line.
  if (err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  // Forward to Sentry when configured.
  if (isSentryEnabled()) {
    Sentry.withScope((scope) => {
      const { tag, ...rest } = ctx;
      scope.setTag('module', tag);
      scope.setExtras(rest as Record<string, unknown>);
      if (err instanceof Error) {
        Sentry.captureException(err);
      } else {
        Sentry.captureMessage(`${message}: ${errMessage}`, 'error');
      }
    });
  }
}

/**
 * Mask a string so the last 4 characters are visible.
 * Useful for logging IDs or token fragments without full exposure.
 */
export function maskValue(value: string): string {
  if (value.length <= 4) return '****';
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}

/**
 * Strip a secret value from a context object so it is never logged.
 * Call this before passing env-derived values into any log context.
 */
export function redactSecrets(
  ctx: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> {
  const result = { ...ctx };
  for (const key of keys) {
    if (key in result) {
      result[key] = '[REDACTED]';
    }
  }
  return result;
}
