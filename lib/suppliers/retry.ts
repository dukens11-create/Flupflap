import { logWarn } from '@/lib/logger';

type RetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  operation: string;
  provider: string;
};

export async function withSupplierRetry<T>(
  fn: () => Promise<T>,
  { attempts = 2, baseDelayMs = 250, operation, provider }: RetryOptions,
): Promise<T> {
  let currentError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      currentError = error;
      if (attempt >= attempts) break;
      logWarn('Supplier request failed, retrying', {
        tag: 'suppliers/retry',
        provider,
        operation,
        attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * attempt));
    }
  }

  throw currentError;
}
