import { createHash } from 'crypto';

type RateLimitOptions = {
  request: Request;
  key: string;
  windowMs: number;
  max: number;
};

type RateLimitResult = {
  limited: boolean;
  retryAfterSeconds: number;
  remaining: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const RATE_LIMIT_STORE_KEY = '__flupflap_rate_limit_store__';
let lastStoreCleanupAt = 0;

function getRateLimitStore() {
  const globalScope = globalThis as typeof globalThis & {
    [RATE_LIMIT_STORE_KEY]?: Map<string, RateLimitBucket>;
  };
  if (!globalScope[RATE_LIMIT_STORE_KEY]) {
    globalScope[RATE_LIMIT_STORE_KEY] = new Map<string, RateLimitBucket>();
  }
  return globalScope[RATE_LIMIT_STORE_KEY];
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const cloudflareIp = request.headers.get('cf-connecting-ip')?.trim();
  if (cloudflareIp) return cloudflareIp;

  return 'unknown';
}

export function applyRateLimit({
  request,
  key,
  windowMs,
  max,
}: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const store = getRateLimitStore();
  const bucketKey = `${key}:${getClientIp(request)}`;
  const existing = store.get(bucketKey);
  const resetAt = now + windowMs;

  if (!existing || existing.resetAt <= now) {
    store.set(bucketKey, { count: 1, resetAt });
    return { limited: false, retryAfterSeconds: Math.ceil(windowMs / 1000), remaining: max - 1 };
  }

  existing.count += 1;
  store.set(bucketKey, existing);

  const limited = existing.count > max;
  const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  const remaining = Math.max(0, max - existing.count);

  if (store.size > 5000 && now - lastStoreCleanupAt > 60_000) {
    lastStoreCleanupAt = now;
    let scanned = 0;
    for (const [storeKey, bucket] of store.entries()) {
      if (bucket.resetAt <= now) {
        store.delete(storeKey);
      }
      scanned += 1;
      if (scanned >= 250) break;
    }
  }

  return { limited, retryAfterSeconds, remaining };
}

export function sanitizeTextInput(input: string, maxLength = 200): string {
  return input
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/`/g, '')
    .trim()
    .slice(0, maxLength);
}

export function hashForLogging(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}
