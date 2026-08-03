/**
 * Rate-limiting middleware for Next.js App Router — issue #534
 *
 * Applies sliding-window rate limiting to public API submission endpoints.
 * Mount in `src/middleware.ts` (Next.js edge middleware) or call directly
 * from individual route handlers for fine-grained control.
 *
 * # Keying strategy
 * Rate-limit key = IP address extracted from:
 *   1. X-Forwarded-For header (first IP, set by proxies / Vercel)
 *   2. X-Real-IP header (nginx convention)
 *   3. "anonymous" fallback (always-allow when IP cannot be determined)
 *
 * # Configuration (environment variables)
 * | Variable                | Default | Description                              |
 * |-------------------------|---------|------------------------------------------|
 * | RATE_LIMIT_MAX_REQUESTS | 60      | Requests per window                      |
 * | RATE_LIMIT_WINDOW_MS    | 60000   | Window duration in ms                    |
 * | RATE_LIMIT_KEY_PREFIX   | rl      | Redis key prefix                         |
 * | RATE_LIMIT_SKIP_IPS     | —       | Comma-separated IPs to always allow      |
 *
 * @example Route-level usage:
 * ```ts
 * // apps/web/src/app/api/stream/route.ts
 * import { withRateLimit } from "@/middlewares/rate-limit.middleware";
 *
 * export const POST = withRateLimit(async (req) => {
 *   // ...handler
 * }, { limit: 10, windowMs: 60_000, keyPrefix: "rl:stream" });
 * ```
 */

import { NextRequest, NextResponse } from "next/server";
import { getRedisClient } from "@/lib/redis";
import {
  RateLimiter,
  createRateLimiter,
  buildRateLimitHeaders,
  type RateLimitOptions,
} from "@/lib/rate-limit";

// ── IP extraction ─────────────────────────────────────────────────────────────

export function extractIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0].trim();
    if (first) return first;
  }
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  // NextRequest.ip is available in some deployment environments
  const ip = (req as unknown as { ip?: string }).ip;
  if (ip) return ip;
  return "anonymous";
}

// ── Skip list ─────────────────────────────────────────────────────────────────

function getSkipIps(): Set<string> {
  const raw = process.env.RATE_LIMIT_SKIP_IPS ?? "";
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

// ── Core check ────────────────────────────────────────────────────────────────

/**
 * Check whether a request should be rate-limited.
 * Returns `null` if allowed, or a `NextResponse` (429) if rejected.
 */
export async function checkRateLimit(
  req: NextRequest,
  limiter: RateLimiter
): Promise<NextResponse | null> {
  const ip = extractIp(req);

  // Skip-list: internal/trusted IPs bypass rate limiting
  if (getSkipIps().has(ip)) return null;

  const result = await limiter.check(ip);
  const headers = buildRateLimitHeaders(result);

  if (!result.allowed) {
    return NextResponse.json(
      {
        error: "Too many requests",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter: headers["Retry-After"],
      },
      {
        status: 429,
        headers,
      }
    );
  }

  return null;
}

// ── HOC wrapper ───────────────────────────────────────────────────────────────

type RouteHandler = (req: NextRequest) => Promise<NextResponse> | NextResponse;

/**
 * Higher-order function that wraps a Next.js App Router route handler
 * with sliding-window rate limiting.
 *
 * @param handler  — the original route handler
 * @param options  — rate-limit options (overrides env vars)
 */
export function withRateLimit(
  handler: RouteHandler,
  options?: Partial<RateLimitOptions>
): RouteHandler {
  const limiter = createRateLimiter(getRedisClient(), options);

  return async (req: NextRequest): Promise<NextResponse> => {
    const limited = await checkRateLimit(req, limiter);
    if (limited) return limited;
    return handler(req);
  };
}

// ── Default limiters for public submission endpoints ─────────────────────────

let _streamLimiter: RateLimiter | null = null;
let _submitLimiter: RateLimiter | null = null;

/** 30 stream-creation requests per minute per IP */
export function getStreamLimiter(): RateLimiter {
  if (!_streamLimiter) {
    _streamLimiter = new RateLimiter(getRedisClient(), {
      limit: Number(process.env.RATE_LIMIT_STREAM_MAX ?? 30),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      keyPrefix: "rl:stream",
    });
  }
  return _streamLimiter;
}

/** 10 payment-submission requests per minute per IP */
export function getSubmitLimiter(): RateLimiter {
  if (!_submitLimiter) {
    _submitLimiter = new RateLimiter(getRedisClient(), {
      limit: Number(process.env.RATE_LIMIT_SUBMIT_MAX ?? 10),
      windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000),
      keyPrefix: "rl:submit",
    });
  }
  return _submitLimiter;
}
