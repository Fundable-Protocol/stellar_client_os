// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import {
  GeoCache,
  buildBboxKey,
  buildRadiusKey,
  buildAggregatesKey,
  buildDetailKey,
  type BoundingBox,
  type RadiusQuery,
  type StreamLocation,
  type StreamAggregates,
} from "./geo-cache";

type RedisClientParam = ConstructorParameters<typeof GeoCache>[0];

// ── Mock Redis ────────────────────────────────────────────────────────────────

function makeRedis(store: Record<string, string> = {}) {
  const data = { ...store };
  const ttls: Record<string, number> = {};

  return {
    get: vi.fn(async (key: string) => data[key] ?? null),
    set: vi.fn(async (key: string, val: string) => { data[key] = val; return "OK"; }),
    setex: vi.fn(async (key: string, ttl: number, val: string) => {
      data[key] = val;
      ttls[key] = ttl;
      return "OK";
    }),
    del: vi.fn(async (...keys: string[]) => {
      let n = 0;
      for (const k of keys) { if (data[k] !== undefined) { delete data[k]; n++; } }
      return n;
    }),
    scan: vi.fn(async () => ["0", []]),
    ttl: vi.fn(async (key: string) => ttls[key] ?? -2),
    _data: data,
    _ttls: ttls,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BBOX: BoundingBox = { swLat: -1, swLng: 30, neLat: 5, neLng: 36 };
const RADIUS: RadiusQuery = { lat: 6.5, lng: 3.3, radiusKm: 50 };

const STREAM: StreamLocation = {
  id: "stream-1",
  lat: 2.5,
  lng: 33.0,
  sender: "GAAA",
  recipient: "GBBB",
  token: "USDC",
  amount: "1000000000",
  status: "active",
  createdAt: 1700000000,
};

const AGGREGATES: StreamAggregates = {
  totalStreams: 42,
  activeStreams: 18,
  totalVolumeUsd: "123456.78",
  uniqueSenders: 30,
  uniqueRecipients: 25,
  latestStreamAt: "2025-01-15T10:30:00Z",
  tokenBreakdown: [
    { token: "USDC", count: 35, totalAmount: "100000000000" },
  ],
};

// ── Key builders ──────────────────────────────────────────────────────────────

describe("buildBboxKey", () => {
  it("produces a consistent key for the same bbox", () => {
    const k1 = buildBboxKey(BBOX);
    const k2 = buildBboxKey(BBOX);
    expect(k1).toBe(k2);
  });

  it("rounds coordinates to 4 decimal places", () => {
    const k1 = buildBboxKey({ swLat: -1.00001, swLng: 30.00001, neLat: 5.00001, neLng: 36.00001 });
    const k2 = buildBboxKey(BBOX);
    expect(k1).toBe(k2);
  });

  it("produces different keys for different bboxes", () => {
    const k1 = buildBboxKey(BBOX);
    const k2 = buildBboxKey({ ...BBOX, swLat: -2 });
    expect(k1).not.toBe(k2);
  });

  it("includes filters in the key when provided", () => {
    const noFilter = buildBboxKey(BBOX);
    const withFilter = buildBboxKey(BBOX, { status: "active" });
    expect(withFilter).not.toBe(noFilter);
    expect(withFilter).toContain("status:active");
  });

  it("produces same key regardless of filter key order", () => {
    const k1 = buildBboxKey(BBOX, { status: "active", token: "USDC" });
    const k2 = buildBboxKey(BBOX, { token: "USDC", status: "active" });
    expect(k1).toBe(k2);
  });

  it("starts with geo:bbox prefix", () => {
    expect(buildBboxKey(BBOX)).toMatch(/^geo:bbox:/);
  });
});

describe("buildRadiusKey", () => {
  it("produces a consistent key for the same query", () => {
    expect(buildRadiusKey(RADIUS)).toBe(buildRadiusKey(RADIUS));
  });

  it("produces different keys for different radii", () => {
    const k1 = buildRadiusKey(RADIUS);
    const k2 = buildRadiusKey({ ...RADIUS, radiusKm: 100 });
    expect(k1).not.toBe(k2);
  });

  it("starts with geo:radius prefix", () => {
    expect(buildRadiusKey(RADIUS)).toMatch(/^geo:radius:/);
  });
});

describe("buildAggregatesKey", () => {
  it("includes the scope in the key", () => {
    expect(buildAggregatesKey("global")).toBe("geo:aggs:global");
    expect(buildAggregatesKey("NG")).toBe("geo:aggs:NG");
  });
});

describe("buildDetailKey", () => {
  it("includes the stream id in the key", () => {
    expect(buildDetailKey("stream-42")).toBe("geo:detail:stream-42");
  });
});

// ── GeoCache.get / set ────────────────────────────────────────────────────────

describe("GeoCache get/set", () => {
  it("returns null on cache miss", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.get("missing-key")).toBeNull();
  });

  it("returns stored value after set", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.set("test-key", { hello: "world" });
    const result = await cache.get<{ hello: string }>("test-key");
    expect(result?.hello).toBe("world");
  });

  it("calls setex when ttlSeconds > 0", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.set("key", "value", { ttlSeconds: 30 });
    expect(redis.setex).toHaveBeenCalledWith("key", 30, JSON.stringify("value"));
  });

  it("calls set (no TTL) when ttlSeconds is 0", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.set("key", "value", { ttlSeconds: 0 });
    expect(redis.set).toHaveBeenCalled();
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("returns null when Redis is null", async () => {
    const cache = new GeoCache(null);
    expect(await cache.get("k")).toBeNull();
  });

  it("silently no-ops set when Redis is null", async () => {
    const cache = new GeoCache(null);
    await expect(cache.set("k", "v")).resolves.toBeUndefined();
  });

  it("returns null when Redis get throws", async () => {
    const redis = { get: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) };
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cache.get("k")).toBeNull();
    spy.mockRestore();
  });
});

// ── BBox helpers ──────────────────────────────────────────────────────────────

describe("GeoCache bbox helpers", () => {
  it("getBboxStreams returns null on miss", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.getBboxStreams(BBOX)).toBeNull();
  });

  it("getBboxStreams returns cached data after set", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setBboxStreams(BBOX, [STREAM]);
    const result = await cache.getBboxStreams(BBOX);
    expect(result).toHaveLength(1);
    expect(result![0].id).toBe("stream-1");
  });

  it("setBboxStreams applies default TTL", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setBboxStreams(BBOX, []);
    expect(redis.setex).toHaveBeenCalledWith(
      expect.any(String),
      30, // DEFAULT_TTL.bbox
      expect.any(String)
    );
  });

  it("setBboxStreams applies custom TTL when provided", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setBboxStreams(BBOX, [], undefined, 90);
    expect(redis.setex).toHaveBeenCalledWith(expect.any(String), 90, expect.any(String));
  });

  it("filter-keyed and unfiltered entries are independent", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setBboxStreams(BBOX, [STREAM]);
    await cache.setBboxStreams(BBOX, [], { status: "completed" });
    const unfiltered = await cache.getBboxStreams(BBOX);
    const filtered = await cache.getBboxStreams(BBOX, { status: "completed" });
    expect(unfiltered).toHaveLength(1);
    expect(filtered).toHaveLength(0);
  });
});

// ── Radius helpers ────────────────────────────────────────────────────────────

describe("GeoCache radius helpers", () => {
  it("getRadiusStreams returns null on miss", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.getRadiusStreams(RADIUS)).toBeNull();
  });

  it("getRadiusStreams returns cached data after set", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setRadiusStreams(RADIUS, [STREAM]);
    const result = await cache.getRadiusStreams(RADIUS);
    expect(result).toHaveLength(1);
  });

  it("setRadiusStreams applies default TTL of 60s", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setRadiusStreams(RADIUS, []);
    expect(redis.setex).toHaveBeenCalledWith(expect.any(String), 60, expect.any(String));
  });
});

// ── Aggregates helpers ────────────────────────────────────────────────────────

describe("GeoCache aggregates helpers", () => {
  it("getAggregates returns null on miss", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.getAggregates("global")).toBeNull();
  });

  it("getAggregates returns cached aggregates after set", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setAggregates("global", AGGREGATES);
    const result = await cache.getAggregates("global");
    expect(result?.totalStreams).toBe(42);
    expect(result?.tokenBreakdown).toHaveLength(1);
  });

  it("setAggregates applies default TTL of 120s", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setAggregates("global", AGGREGATES);
    expect(redis.setex).toHaveBeenCalledWith(expect.any(String), 120, expect.any(String));
  });

  it("different scopes are independent", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setAggregates("global", AGGREGATES);
    await cache.setAggregates("NG", { ...AGGREGATES, totalStreams: 5 });
    expect((await cache.getAggregates("global"))?.totalStreams).toBe(42);
    expect((await cache.getAggregates("NG"))?.totalStreams).toBe(5);
  });
});

// ── Detail helpers ────────────────────────────────────────────────────────────

describe("GeoCache detail helpers", () => {
  it("getDetail returns null on miss", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.getDetail("stream-1")).toBeNull();
  });

  it("getDetail returns cached stream after setDetail", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setDetail("stream-1", STREAM);
    const result = await cache.getDetail("stream-1");
    expect(result?.id).toBe("stream-1");
  });

  it("setDetail applies default TTL of 300s", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.setDetail("x", STREAM);
    expect(redis.setex).toHaveBeenCalledWith(expect.any(String), 300, expect.any(String));
  });
});

// ── delete / deletePattern ────────────────────────────────────────────────────

describe("GeoCache delete operations", () => {
  it("delete removes a key and returns 1", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.set("del-key", "value");
    const count = await cache.delete("del-key");
    expect(count).toBe(1);
    expect(await cache.get("del-key")).toBeNull();
  });

  it("delete returns 0 for unknown key", async () => {
    const cache = new GeoCache(makeRedis() as unknown as RedisClientParam);
    expect(await cache.delete("ghost")).toBe(0);
  });

  it("delete returns 0 when Redis is null", async () => {
    const cache = new GeoCache(null);
    expect(await cache.delete("k")).toBe(0);
  });

  it("deletePattern scans and deletes matching keys", async () => {
    const redis = makeRedis();
    // Override scan to return two keys on first call, then signal done
    let call = 0;
    redis.scan = vi.fn(async () => {
      if (call++ === 0) return ["0", ["geo:bbox:key1", "geo:bbox:key2"]];
      return ["0", []];
    });
    // Seed the data
    (redis._data as Record<string, string>)["geo:bbox:key1"] = "v";
    (redis._data as Record<string, string>)["geo:bbox:key2"] = "v";

    const cache = new GeoCache(redis as unknown as RedisClientParam);
    const deleted = await cache.deletePattern("geo:bbox:*");
    expect(deleted).toBe(2);
  });
});

// ── invalidateGeoCache / invalidateStream ─────────────────────────────────────

describe("GeoCache invalidation", () => {
  it("invalidateGeoCache calls deletePattern with bbox prefix", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    const spy = vi.spyOn(cache, "deletePattern");
    await cache.invalidateGeoCache();
    expect(spy).toHaveBeenCalledWith("geo:bbox:*");
  });

  it("invalidateStream deletes detail and agg patterns", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    const deleteSpy = vi.spyOn(cache, "delete");
    const patternSpy = vi.spyOn(cache, "deletePattern");
    await cache.invalidateStream("stream-99");
    expect(deleteSpy).toHaveBeenCalledWith("geo:detail:stream-99");
    expect(patternSpy).toHaveBeenCalledWith("geo:aggs:*");
  });
});

// ── TTL ───────────────────────────────────────────────────────────────────────

describe("GeoCache.ttl", () => {
  it("returns null when Redis is null", async () => {
    const cache = new GeoCache(null);
    expect(await cache.ttl("k")).toBeNull();
  });

  it("returns the remaining TTL in seconds", async () => {
    const redis = makeRedis();
    const cache = new GeoCache(redis as unknown as RedisClientParam);
    await cache.set("ttl-key", "v", { ttlSeconds: 45 });
    redis.ttl.mockResolvedValueOnce(45);
    expect(await cache.ttl("ttl-key")).toBe(45);
  });
});
