/**
 * Shared Redis client for FlupFlap.
 *
 * When REDIS_URL is set the app connects to that Redis instance (Upstash,
 * Redis Cloud, Render Redis, etc.) and uses it for distributed rate limiting.
 *
 * When REDIS_URL is absent the module exports `null` and callers must fall back
 * to in-memory enforcement with a logged warning.
 *
 * The connection is lazily created on first use so that the build does not fail
 * when REDIS_URL is unavailable at build time.
 */

import type { Redis as RedisClient } from 'ioredis';

const REDIS_CLIENT_KEY = '__flupflap_redis_client__';

type GlobalWithRedis = typeof globalThis & {
  [REDIS_CLIENT_KEY]?: RedisClient | null;
};

/**
 * Returns the lazily-initialised Redis client, or `null` when REDIS_URL is not
 * configured. Errors during connection are caught so the app never crashes on
 * startup; the caller must handle the null case.
 */
export function getRedisClient(): RedisClient | null {
  const g = globalThis as GlobalWithRedis;

  // Already resolved (connected or deliberately null).
  if (REDIS_CLIENT_KEY in g) {
    return g[REDIS_CLIENT_KEY] ?? null;
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    g[REDIS_CLIENT_KEY] = null;
    return null;
  }

  try {
    // Dynamic require so that the module can be imported in environments where
    // ioredis is present without a top-level require that would break if the
    // package were missing.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { default: Redis } = require('ioredis') as { default: typeof RedisClient };
    const client = new Redis(url, {
      // Fail fast during connection so the in-memory fallback kicks in quickly.
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      // Do not flood logs if Redis is temporarily unavailable.
      showFriendlyErrorStack: false,
    });

    client.on('error', () => {
      // Errors are handled per-call in applyRateLimitAsync; silence the global
      // event to avoid unhandled-rejection noise.
    });

    g[REDIS_CLIENT_KEY] = client;
    return client;
  } catch {
    g[REDIS_CLIENT_KEY] = null;
    return null;
  }
}
