/**
 * Tests for the shared rate-limiting implementation (lib/security.ts).
 *
 * These tests exercise:
 *  - In-memory throttling triggers at the correct threshold.
 *  - Limit reset when the window expires.
 *  - Per-user vs per-IP identity key isolation.
 *  - Redis-backed path with a mock Redis client.
 *  - Graceful fallback to in-memory when Redis is unavailable.
 *  - Read (non-write) style calls are not excessively restricted.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal Request object with the given IP header. */
function makeRequest(ip = '1.2.3.4'): Request {
  return new Request('http://localhost/test', {
    headers: { 'x-forwarded-for': ip },
  });
}

// ── Unit-import of in-memory helpers ─────────────────────────────────────────

// We test the synchronous `applyRateLimit` and the helpers directly because
// they contain the shared in-memory logic that the async path falls back to.
import { applyRateLimit, getClientIp, applyRateLimitAsync } from '@/lib/security';

// ── getClientIp ───────────────────────────────────────────────────────────────

test('getClientIp extracts the first address from x-forwarded-for', () => {
  const req = new Request('http://localhost/', {
    headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
  });
  assert.equal(getClientIp(req), '10.0.0.1');
});

test('getClientIp falls back to x-real-ip', () => {
  const req = new Request('http://localhost/', {
    headers: { 'x-real-ip': '203.0.113.5' },
  });
  assert.equal(getClientIp(req), '203.0.113.5');
});

test('getClientIp returns "unknown" when no header is set', () => {
  const req = new Request('http://localhost/');
  assert.equal(getClientIp(req), 'unknown');
});

// ── In-memory applyRateLimit ──────────────────────────────────────────────────

test('in-memory: allows requests below the limit', () => {
  const key = `test:inmem:allow:${Date.now()}`;
  const req = makeRequest('5.5.5.5');

  for (let i = 0; i < 3; i++) {
    const result = applyRateLimit({ request: req, key, windowMs: 5000, max: 3 });
    assert.equal(result.limited, false);
  }
});

test('in-memory: blocks after exceeding the limit', () => {
  const key = `test:inmem:block:${Date.now()}`;
  const req = makeRequest('6.6.6.6');

  // Exhaust the limit.
  for (let i = 0; i < 3; i++) {
    applyRateLimit({ request: req, key, windowMs: 5000, max: 3 });
  }

  // Next call must be limited.
  const result = applyRateLimit({ request: req, key, windowMs: 5000, max: 3 });
  assert.equal(result.limited, true);
  assert.ok(result.retryAfterSeconds >= 1);
  assert.equal(result.remaining, 0);
});

test('in-memory: different IPs have independent counters', () => {
  const key = `test:inmem:isolation:${Date.now()}`;

  const reqA = makeRequest('7.7.7.7');
  const reqB = makeRequest('8.8.8.8');

  // Exhaust limit for IP A.
  for (let i = 0; i < 3; i++) {
    applyRateLimit({ request: reqA, key, windowMs: 5000, max: 3 });
  }
  const limitedA = applyRateLimit({ request: reqA, key, windowMs: 5000, max: 3 });
  assert.equal(limitedA.limited, true);

  // IP B must still have headroom.
  const resultB = applyRateLimit({ request: reqB, key, windowMs: 5000, max: 3 });
  assert.equal(resultB.limited, false);
});

test('in-memory: counter resets after window expires', async () => {
  const key = `test:inmem:reset:${Date.now()}`;
  const req = makeRequest('9.9.9.9');
  const windowMs = 50; // Very short window for test speed.

  // Exhaust the limit.
  for (let i = 0; i < 2; i++) {
    applyRateLimit({ request: req, key, windowMs, max: 2 });
  }
  const blocked = applyRateLimit({ request: req, key, windowMs, max: 2 });
  assert.equal(blocked.limited, true);

  // Wait for window to expire.
  await new Promise((r) => setTimeout(r, windowMs + 20));

  // Should be allowed again.
  const allowed = applyRateLimit({ request: req, key, windowMs, max: 2 });
  assert.equal(allowed.limited, false);
});

test('in-memory: remaining count decrements correctly', () => {
  const key = `test:inmem:remaining:${Date.now()}`;
  const req = makeRequest('10.10.10.10');

  const first = applyRateLimit({ request: req, key, windowMs: 5000, max: 5 });
  assert.equal(first.remaining, 4);

  const second = applyRateLimit({ request: req, key, windowMs: 5000, max: 5 });
  assert.equal(second.remaining, 3);
});

// ── applyRateLimitAsync — in-memory fallback (no REDIS_URL) ──────────────────

test('applyRateLimitAsync: allows requests below the limit (in-memory path)', async () => {
  const key = `test:async:allow:${Date.now()}`;
  const req = makeRequest('11.11.11.11');

  const result = await applyRateLimitAsync({ request: req, key, windowMs: 5000, max: 5 });
  assert.equal(result.limited, false);
});

test('applyRateLimitAsync: uses userId in identity key (user bucket)', async () => {
  const key = `test:async:userid:${Date.now()}`;
  const reqA = makeRequest('12.12.12.12');
  const reqB = makeRequest('13.13.13.13');

  // Same userId, different IPs → shared bucket.
  for (let i = 0; i < 3; i++) {
    await applyRateLimitAsync({ request: reqA, key, windowMs: 5000, max: 3, userId: 'user_abc' });
  }

  // reqB with the SAME userId must also be limited.
  const resultSameUser = await applyRateLimitAsync({
    request: reqB,
    key,
    windowMs: 5000,
    max: 3,
    userId: 'user_abc',
  });
  assert.equal(resultSameUser.limited, true);

  // reqB with a DIFFERENT userId must not be limited.
  const resultDiffUser = await applyRateLimitAsync({
    request: reqB,
    key,
    windowMs: 5000,
    max: 3,
    userId: 'user_xyz',
  });
  assert.equal(resultDiffUser.limited, false);
});

test('applyRateLimitAsync: unauthenticated requests fall back to IP bucket', async () => {
  const key = `test:async:ipfallback:${Date.now()}`;
  const reqA = makeRequest('20.20.20.20');
  const reqB = makeRequest('21.21.21.21');

  // Exhaust IP A's bucket.
  for (let i = 0; i < 2; i++) {
    await applyRateLimitAsync({ request: reqA, key, windowMs: 5000, max: 2 });
  }
  const limitedA = await applyRateLimitAsync({ request: reqA, key, windowMs: 5000, max: 2 });
  assert.equal(limitedA.limited, true);

  // IP B must still pass.
  const resultB = await applyRateLimitAsync({ request: reqB, key, windowMs: 5000, max: 2 });
  assert.equal(resultB.limited, false);
});

// ── applyRateLimitAsync — Redis mock ─────────────────────────────────────────

test('applyRateLimitAsync: uses Redis counter when client is available', async () => {
  // Build a minimal in-memory Redis mock (simulates the ioredis interface).
  const store = new Map<string, { val: number; expiresAt: number }>();

  const mockRedis = {
    async incr(k: string): Promise<number> {
      const now = Date.now();
      const entry = store.get(k);
      if (!entry || entry.expiresAt <= now) {
        store.set(k, { val: 1, expiresAt: now + 10_000 });
        return 1;
      }
      entry.val += 1;
      return entry.val;
    },
    async expire(k: string, seconds: number): Promise<number> {
      const entry = store.get(k);
      if (entry) entry.expiresAt = Date.now() + seconds * 1000;
      return 1;
    },
    async ttl(k: string): Promise<number> {
      const entry = store.get(k);
      if (!entry) return -2;
      return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
    },
    on() { return this; },
  };

  // Temporarily inject the mock into globalThis under the key used by lib/redis.ts.
  const REDIS_KEY = '__flupflap_redis_client__';
  const g = globalThis as Record<string, unknown>;
  const prev = g[REDIS_KEY];
  g[REDIS_KEY] = mockRedis;

  try {
    const key = `test:redis:counter:${Date.now()}`;
    const req = makeRequest('30.30.30.30');

    // First two calls must pass.
    for (let i = 0; i < 2; i++) {
      const r = await applyRateLimitAsync({ request: req, key, windowMs: 5000, max: 2, userId: 'u1' });
      assert.equal(r.limited, false);
    }

    // Third call must be limited.
    const limited = await applyRateLimitAsync({ request: req, key, windowMs: 5000, max: 2, userId: 'u1' });
    assert.equal(limited.limited, true);
    assert.equal(limited.remaining, 0);
    assert.ok(limited.retryAfterSeconds >= 1);
  } finally {
    // Restore previous Redis state.
    g[REDIS_KEY] = prev;
  }
});

test('applyRateLimitAsync: falls back to in-memory when Redis throws', async () => {
  const REDIS_KEY = '__flupflap_redis_client__';
  const g = globalThis as Record<string, unknown>;
  const prev = g[REDIS_KEY];

  // Inject a Redis client that always throws.
  g[REDIS_KEY] = {
    async incr(): Promise<number> { throw new Error('Redis connection refused'); },
    async expire(): Promise<number> { return 0; },
    async ttl(): Promise<number> { return -1; },
    on() { return this; },
  };

  try {
    const key = `test:redis:fallback:${Date.now()}`;
    const req = makeRequest('40.40.40.40');

    // Should not throw — must fall back to in-memory silently.
    const result = await applyRateLimitAsync({ request: req, key, windowMs: 5000, max: 5 });
    assert.equal(result.limited, false);
  } finally {
    g[REDIS_KEY] = prev;
  }
});

// ── Non-write endpoints are not over-restricted ───────────────────────────────

test('high-limit endpoints allow typical read volumes easily', async () => {
  // Simulate a read-style endpoint with a generous limit (e.g. 100/min).
  const key = `test:read:high-limit:${Date.now()}`;
  const req = makeRequest('50.50.50.50');

  let limited = 0;
  for (let i = 0; i < 20; i++) {
    const r = await applyRateLimitAsync({ request: req, key, windowMs: 60_000, max: 100 });
    if (r.limited) limited++;
  }
  assert.equal(limited, 0, 'Read-style endpoints with high limits must not throttle normal usage');
});
