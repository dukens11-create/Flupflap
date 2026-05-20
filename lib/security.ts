import { createHash } from 'crypto';
import { getRedisClient } from '@/lib/redis';
import { logWarn } from '@/lib/logger';

type RateLimitOptions = {
  request: Request;
  key: string;
  windowMs: number;
  max: number;
  /** Optional authenticated user ID; used as identity key when set. */
  userId?: string | null;
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
  const bucketKey = `${key}:${getClientIp(request)}`;
  return applyRateLimitByKey(bucketKey, windowMs, max);
}

/** Internal helper — apply the in-memory rate limit for a fully-formed bucket key. */
function applyRateLimitByKey(bucketKey: string, windowMs: number, max: number): RateLimitResult {
  const now = Date.now();
  const store = getRateLimitStore();
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

// ─── Shared / Redis-backed rate limiting ─────────────────────────────────────

/**
 * Async rate limiter that uses Redis as the shared backing store when
 * REDIS_URL is configured, falling back to the in-memory implementation when
 * Redis is unavailable.
 *
 * **Identity key resolution** (most-specific wins):
 *  1. Authenticated user ID  → `rl:{key}:u:{userId}`
 *  2. Client IP fallback     → `rl:{key}:ip:{ip}`
 *
 * **Graceful degradation**
 *  - If Redis throws, a `[WARN]` is emitted and the in-memory store is used
 *    for the remainder of that request so per-instance throttling still applies.
 *  - When running without REDIS_URL the in-memory store is used silently
 *    (suitable for single-instance or development deployments).
 */
export async function applyRateLimitAsync({
  request,
  key,
  windowMs,
  max,
  userId,
}: RateLimitOptions): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const identity = userId ? `u:${userId}` : `ip:${ip}`;
  const redisKey = `rl:${key}:${identity}`;
  const windowSeconds = Math.ceil(windowMs / 1000);

  const redis = getRedisClient();
  if (redis) {
    try {
      // Fixed-window counter: INCR + EXPIRE (set only on first hit).
      const count = await redis.incr(redisKey);
      if (count === 1) {
        await redis.expire(redisKey, windowSeconds);
      }
      const ttl = await redis.ttl(redisKey);
      const retryAfterSeconds = Math.max(1, ttl > 0 ? ttl : windowSeconds);
      const remaining = Math.max(0, max - count);
      const limited = count > max;

      if (limited) {
        logWarn('Rate limit exceeded (Redis)', {
          tag: 'rate-limit',
          key,
          identity: hashForLogging(identity),
          count,
          max,
        });
      }

      return { limited, retryAfterSeconds, remaining };
    } catch (redisErr) {
      logWarn('Redis rate-limit unavailable — falling back to in-memory', {
        tag: 'rate-limit',
        key,
        errMessage: redisErr instanceof Error ? redisErr.message : String(redisErr),
      });
      // Fall through to in-memory.
    }
  }

  // In-memory fallback (preserves per-instance throttling).
  // Use the pre-computed identity as the bucket key so user-keyed limits
  // are correctly isolated even when Redis is unavailable.
  const memKey = `${key}:${identity}`;
  return applyRateLimitByKey(memKey, windowMs, max);
}
