/**
 * Sliding-window rate limiter — issue #534
 *
 * Uses a Redis sorted-set per key to implement a precise sliding-window
 * counter. Each request adds a timestamped member; members older than the
 * window are pruned atomically via a Lua script.
 *
 * # Why sliding window vs fixed window?
 * Fixed windows allow up to 2× the stated limit at window boundaries.
 * Sliding windows give a uniform guarantee: at most `limit` requests
 * in any rolling `windowMs` period.
 *
 * # Atomic execution
 * The Lua script runs as a single Redis command — no TOCTOU races even
 * under high concurrency across multiple app instances.
 *
 * # Graceful degradation
 * When Redis is unavailable `check()` returns `allowed: true` so the app
 * keeps serving requests rather than entering a hard-fail state.
 *
 * # Storage
 * Each key holds a sorted set where score = timestamp (ms).
 * TTL is set to `ceil(windowMs / 1000) + 1` seconds so keys auto-expire.
 *
 * @module rate-limit
 */

import type { RedisClient } from "./redis";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Max requests allowed within `windowMs`. */
  limit: number;
  /** Rolling window size in milliseconds. Default: 60 000 (1 min). */
  windowMs?: number;
  /**
   * Key prefix prepended before the identifier.
   * Useful for scoping different endpoints: "rl:stream", "rl:submit", etc.
   */
  keyPrefix?: string;
}

export interface RateLimitResult {
  /** Whether this request is allowed through. */
  allowed: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Total limit for the window. */
  limit: number;
  /** Unix timestamp (ms) when the oldest request in the window expires. */
  resetAt: number;
  /** How many requests have been made in the current window. */
  count: number;
}

// ── Lua script ────────────────────────────────────────────────────────────────

/**
 * Atomic sliding-window Lua script.
 *
 * KEYS[1] — sorted-set key (e.g. "rl:stream:127.0.0.1")
 * ARGV[1] — current timestamp in ms (string)
 * ARGV[2] — window size in ms
 * ARGV[3] — request limit
 * ARGV[4] — TTL for the key in seconds
 *
 * Returns: { count, oldest_score }  as a two-element array
 *   count        — number of requests in the window AFTER adding this one
 *   oldest_score — score (ms) of the oldest entry still in the window
 *                  (0 when the set was empty before this request)
 */
const SLIDING_WINDOW_SCRIPT = `
local key        = KEYS[1]
local now        = tonumber(ARGV[1])
local window_ms  = tonumber(ARGV[2])
local limit      = tonumber(ARGV[3])
local ttl_secs   = tonumber(ARGV[4])
local cutoff     = now - window_ms

-- Remove entries outside the window
redis.call('ZREMRANGEBYSCORE', key, '-inf', cutoff)

-- Count existing entries
local count = redis.call('ZCARD', key)

-- Add this request (score = now, member = now + random suffix for uniqueness)
local member = tostring(now) .. ':' .. tostring(math.random(1, 1000000))
redis.call('ZADD', key, now, member)
count = count + 1

-- Reset TTL
redis.call('EXPIRE', key, ttl_secs)

-- Oldest entry still in window
local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
local oldest_score = 0
if #oldest > 0 then
  oldest_score = tonumber(oldest[2])
end

return { count, oldest_score }
`;

// ── Rate limiter class ─────────────────────────────────────────────────────────

export class RateLimiter {
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly keyPrefix: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisClient | null,
    options: RateLimitOptions
  ) {
    this.limit = options.limit;
    this.windowMs = options.windowMs ?? 60_000;
    this.keyPrefix = options.keyPrefix ?? "rl";
    this.ttlSeconds = Math.ceil(this.windowMs / 1_000) + 1;
  }

  /**
   * Check and record a request for `identifier` (typically an IP address
   * or authenticated user ID).
   *
   * @returns `RateLimitResult` — always resolves, never rejects.
   *          When Redis is unavailable: `allowed: true`, remaining = limit.
   */
  async check(identifier: string): Promise<RateLimitResult> {
    const key = `${this.keyPrefix}:${identifier}`;
    const now = Date.now();

    if (!this.redis) {
      return this.buildResult(true, 0, now);
    }

    try {
      const result = await this.redis.eval(
        SLIDING_WINDOW_SCRIPT,
        1,
        key,
        String(now),
        String(this.windowMs),
        String(this.limit),
        String(this.ttlSeconds)
      ) as [number, number];

      const count = result[0];
      const oldestScore = result[1];
      const allowed = count <= this.limit;
      const resetAt =
        oldestScore > 0 ? oldestScore + this.windowMs : now + this.windowMs;

      return {
        allowed,
        remaining: Math.max(0, this.limit - count),
        limit: this.limit,
        resetAt,
        count,
      };
    } catch (err) {
      console.error("[rate-limit] Redis error — allowing request:", (err as Error).message);
      return this.buildResult(true, 0, now);
    }
  }

  private buildResult(
    allowed: boolean,
    count: number,
    now: number
  ): RateLimitResult {
    return {
      allowed,
      remaining: Math.max(0, this.limit - count),
      limit: this.limit,
      resetAt: now + this.windowMs,
      count,
    };
  }
}

// ── Preset factory ────────────────────────────────────────────────────────────

/**
 * Create a `RateLimiter` from environment variables with sensible defaults.
 *
 * Environment variables (all optional):
 * | Variable                   | Default | Description                          |
 * |----------------------------|---------|--------------------------------------|
 * | RATE_LIMIT_MAX_REQUESTS    | 60      | Max requests per window              |
 * | RATE_LIMIT_WINDOW_MS       | 60000   | Window size in ms (default: 1 min)   |
 * | RATE_LIMIT_KEY_PREFIX      | rl      | Key prefix in Redis                  |
 */
export function createRateLimiter(
  redis: RedisClient | null,
  overrides?: Partial<RateLimitOptions>
): RateLimiter {
  return new RateLimiter(redis, {
    limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 60),
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    keyPrefix: process.env.RATE_LIMIT_KEY_PREFIX ?? "rl",
    ...overrides,
  });
}

// ── Response header helpers ───────────────────────────────────────────────────

/**
 * Build the standard rate-limit response headers.
 *
 * Follows the IETF `RateLimit` header draft and the widely-adopted
 * `X-RateLimit-*` convention for compatibility:
 *   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset
 *   X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
 *   Retry-After (only when rejected)
 */
export function buildRateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  const resetSeconds = Math.ceil((result.resetAt - Date.now()) / 1_000);
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(result.limit),
    "RateLimit-Remaining": String(result.remaining),
    "RateLimit-Reset": String(resetSeconds),
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(resetSeconds),
  };
  if (!result.allowed) {
    headers["Retry-After"] = String(Math.max(1, resetSeconds));
  }
  return headers;
}
