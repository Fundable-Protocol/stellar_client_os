// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  RateLimiter,
  buildRateLimitHeaders,
  createRateLimiter,
  type RateLimitResult,
} from "./rate-limit";

// ── Mock Redis client ─────────────────────────────────────────────────────────

type RedisClientParam = ConstructorParameters<typeof RateLimiter>[0];

function makeRedis(evalResult: [number, number] = [1, Date.now()]) {
  return {
    eval: vi.fn().mockResolvedValue(evalResult),
    quit: vi.fn().mockResolvedValue("OK"),
  };
}

// ── RateLimiter ───────────────────────────────────────────────────────────────

describe("RateLimiter.check", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns allowed:true when count is within limit", async () => {
    const redis = makeRedis([3, Date.now() - 10_000]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 10, windowMs: 60_000 });
    const result = await limiter.check("127.0.0.1");
    expect(result.allowed).toBe(true);
    expect(result.count).toBe(3);
    expect(result.remaining).toBe(7);
    expect(result.limit).toBe(10);
  });

  it("returns allowed:false when count exceeds limit", async () => {
    const redis = makeRedis([11, Date.now() - 5_000]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 10, windowMs: 60_000 });
    const result = await limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.count).toBe(11);
  });

  it("returns allowed:true at exactly the limit (boundary)", async () => {
    const redis = makeRedis([10, Date.now()]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 10, windowMs: 60_000 });
    const result = await limiter.check("192.168.1.1");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("gracefully allows when Redis is null", async () => {
    const limiter = new RateLimiter(null, { limit: 10, windowMs: 60_000 });
    const result = await limiter.check("1.2.3.4");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(10);
  });

  it("gracefully allows when Redis eval throws", async () => {
    const redis = { eval: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) };
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 5, windowMs: 60_000 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await limiter.check("5.5.5.5");
    spy.mockRestore();
    expect(result.allowed).toBe(true);
  });

  it("uses the configured keyPrefix in the Redis call", async () => {
    const redis = makeRedis([1, Date.now()]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, {
      limit: 100,
      windowMs: 60_000,
      keyPrefix: "rl:stream",
    });
    await limiter.check("user-abc");
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      "rl:stream:user-abc",
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String)
    );
  });

  it("calculates resetAt from oldest score when present", async () => {
    const now = Date.now();
    const oldestScore = now - 30_000;
    const redis = makeRedis([1, oldestScore]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 10, windowMs: 60_000 });
    const result = await limiter.check("1.1.1.1");
    // resetAt = oldestScore + windowMs
    expect(result.resetAt).toBe(oldestScore + 60_000);
  });

  it("passes correct TTL to Lua script (ceil(windowMs/1000)+1)", async () => {
    const redis = makeRedis([1, Date.now()]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 5, windowMs: 30_000 });
    await limiter.check("x");
    // TTL should be ceil(30000/1000)+1 = 31
    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.any(String),
      expect.any(String),
      "30000",
      "5",
      "31"
    );
  });

  it("uses distinct keys for different identifiers", async () => {
    const redis = makeRedis([1, Date.now()]);
    const limiter = new RateLimiter(redis as unknown as RedisClientParam, { limit: 10, keyPrefix: "rl" });
    await limiter.check("192.168.0.1");
    await limiter.check("192.168.0.2");
    const calls = (redis.eval as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0][2]).toBe("rl:192.168.0.1");
    expect(calls[1][2]).toBe("rl:192.168.0.2");
  });
});

// ── buildRateLimitHeaders ─────────────────────────────────────────────────────

describe("buildRateLimitHeaders", () => {
  const now = Date.now();
  const allowedResult: RateLimitResult = {
    allowed: true,
    remaining: 57,
    limit: 60,
    resetAt: now + 45_000,
    count: 3,
  };
  const rejectedResult: RateLimitResult = {
    allowed: false,
    remaining: 0,
    limit: 60,
    resetAt: now + 30_000,
    count: 61,
  };

  it("includes RateLimit-Limit, Remaining, Reset for allowed requests", () => {
    const headers = buildRateLimitHeaders(allowedResult);
    expect(headers["RateLimit-Limit"]).toBe("60");
    expect(headers["RateLimit-Remaining"]).toBe("57");
    expect(headers["X-RateLimit-Limit"]).toBe("60");
    expect(headers["X-RateLimit-Remaining"]).toBe("57");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("includes Retry-After for rejected requests", () => {
    const headers = buildRateLimitHeaders(rejectedResult);
    expect(headers["Retry-After"]).toBeDefined();
    expect(Number(headers["Retry-After"])).toBeGreaterThan(0);
  });

  it("does not include Retry-After when allowed", () => {
    const headers = buildRateLimitHeaders(allowedResult);
    expect(Object.keys(headers)).not.toContain("Retry-After");
  });

  it("Reset header is in seconds (positive integer)", () => {
    const headers = buildRateLimitHeaders(allowedResult);
    const reset = Number(headers["RateLimit-Reset"]);
    expect(reset).toBeGreaterThan(0);
    expect(Number.isInteger(reset)).toBe(true);
  });
});

// ── createRateLimiter ─────────────────────────────────────────────────────────

describe("createRateLimiter", () => {
  it("creates a RateLimiter with env var defaults", () => {
    const limiter = createRateLimiter(null);
    expect(limiter).toBeInstanceOf(RateLimiter);
  });

  it("overrides are applied over env defaults", async () => {
    const redis = makeRedis([1, Date.now()]);
    const limiter = createRateLimiter(redis as unknown as RedisClientParam, {
      limit: 5,
      keyPrefix: "rl:test",
    });
    await limiter.check("x");
    expect((redis.eval as ReturnType<typeof vi.fn>).mock.calls[0][4]).toBe("5");
    expect((redis.eval as ReturnType<typeof vi.fn>).mock.calls[0][2]).toBe("rl:test:x");
  });
});
