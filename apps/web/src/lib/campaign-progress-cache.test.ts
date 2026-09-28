import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  CampaignProgressCache,
  buildProgressKey,
  buildProgressKeyPattern,
  type CampaignProgressMetrics,
} from "./campaign-progress-cache";

describe("buildProgressKey", () => {
  it("builds a namespaced key for a campaign ID", () => {
    expect(buildProgressKey("campaign-123")).toBe("campaign:progress:campaign-123");
  });
});

describe("buildProgressKeyPattern", () => {
  it("returns a wildcard pattern for all progress keys", () => {
    expect(buildProgressKeyPattern()).toBe("campaign:progress:*");
  });
});

describe("CampaignProgressCache", () => {
  let mockRedis: any;
  let cache: CampaignProgressCache;

  const mockMetrics: CampaignProgressMetrics = {
    campaignId: "campaign-abc",
    treeCount: 100,
    sponsorCount: 25,
    raisedAmount: "5000000",
    co2ImpactKg: 2200,
    calculatedAt: Date.now(),
  };

  beforeEach(() => {
    mockRedis = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue("OK"),
      setex: vi.fn().mockResolvedValue("OK"),
      del: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(-2),
      scan: vi.fn().mockResolvedValue(["0", []]),
      mget: vi.fn().mockResolvedValue([]),
    };
    cache = new CampaignProgressCache(mockRedis);
  });

  describe("get", () => {
    it("returns null when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      const result = await nullCache.get("campaign-123");
      expect(result).toBeNull();
    });

    it("returns null on cache miss", async () => {
      mockRedis.get.mockResolvedValue(null);
      const result = await cache.get("campaign-123");
      expect(result).toBeNull();
      expect(mockRedis.get).toHaveBeenCalledWith("campaign:progress:campaign-123");
    });

    it("returns parsed metrics on cache hit", async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(mockMetrics));
      const result = await cache.get("campaign-abc");
      expect(result).toEqual(mockMetrics);
    });

    it("returns null and logs error on JSON parse failure", async () => {
      mockRedis.get.mockResolvedValue("invalid-json");
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await cache.get("campaign-abc");
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("returns null and logs error on Redis error", async () => {
      mockRedis.get.mockRejectedValue(new Error("Redis connection failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await cache.get("campaign-abc");
      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("set", () => {
    it("no-ops when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      await nullCache.set(mockMetrics);
      // Should not throw
    });

    it("stores metrics with default TTL (300s)", async () => {
      await cache.set(mockMetrics);
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "campaign:progress:campaign-abc",
        300,
        JSON.stringify(mockMetrics)
      );
    });

    it("stores metrics with custom TTL", async () => {
      await cache.set(mockMetrics, { ttlSeconds: 600 });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        "campaign:progress:campaign-abc",
        600,
        JSON.stringify(mockMetrics)
      );
    });

    it("stores metrics without TTL when ttlSeconds is 0", async () => {
      await cache.set(mockMetrics, { ttlSeconds: 0 });
      expect(mockRedis.set).toHaveBeenCalledWith(
        "campaign:progress:campaign-abc",
        JSON.stringify(mockMetrics)
      );
      expect(mockRedis.setex).not.toHaveBeenCalled();
    });

    it("logs error on Redis failure", async () => {
      mockRedis.setex.mockRejectedValue(new Error("Redis write failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await cache.set(mockMetrics);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("invalidate", () => {
    it("no-ops when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      await nullCache.invalidate("campaign-123");
      // Should not throw
    });

    it("deletes the cache key for the campaign", async () => {
      await cache.invalidate("campaign-abc");
      expect(mockRedis.del).toHaveBeenCalledWith("campaign:progress:campaign-abc");
    });

    it("logs error on Redis failure", async () => {
      mockRedis.del.mockRejectedValue(new Error("Redis delete failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      await cache.invalidate("campaign-abc");
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("invalidateAll", () => {
    it("returns 0 when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      const result = await nullCache.invalidateAll();
      expect(result).toBe(0);
    });

    it("scans and deletes all progress keys", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["1", ["campaign:progress:c1", "campaign:progress:c2"]])
        .mockResolvedValueOnce(["0", ["campaign:progress:c3"]]);
      mockRedis.del.mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const result = await cache.invalidateAll();
      
      expect(result).toBe(3);
      expect(mockRedis.scan).toHaveBeenCalledWith(
        "0",
        "MATCH",
        "campaign:progress:*",
        "COUNT",
        100
      );
      expect(mockRedis.del).toHaveBeenCalledWith("campaign:progress:c1", "campaign:progress:c2");
      expect(mockRedis.del).toHaveBeenCalledWith("campaign:progress:c3");
    });

    it("handles empty scan results", async () => {
      mockRedis.scan.mockResolvedValue(["0", []]);
      const result = await cache.invalidateAll();
      expect(result).toBe(0);
    });

    it("returns partial count on error", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["1", ["campaign:progress:c1"]])
        .mockRejectedValueOnce(new Error("Redis scan failed"));
      mockRedis.del.mockResolvedValue(1);
      
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const result = await cache.invalidateAll();
      expect(result).toBe(1);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe("ttl", () => {
    it("returns null when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      const result = await nullCache.ttl("campaign-123");
      expect(result).toBeNull();
    });

    it("returns TTL seconds for existing key", async () => {
      mockRedis.ttl.mockResolvedValue(250);
      const result = await cache.ttl("campaign-abc");
      expect(result).toBe(250);
      expect(mockRedis.ttl).toHaveBeenCalledWith("campaign:progress:campaign-abc");
    });

    it("returns -2 for non-existent key", async () => {
      mockRedis.ttl.mockResolvedValue(-2);
      const result = await cache.ttl("campaign-nonexistent");
      expect(result).toBe(-2);
    });

    it("returns null on error", async () => {
      mockRedis.ttl.mockRejectedValue(new Error("Redis TTL failed"));
      const result = await cache.ttl("campaign-abc");
      expect(result).toBeNull();
    });
  });

  describe("getMany", () => {
    it("returns empty map when Redis is unavailable", async () => {
      const nullCache = new CampaignProgressCache(null);
      const result = await nullCache.getMany(["c1", "c2"]);
      expect(result.size).toBe(0);
    });

    it("returns empty map for empty input", async () => {
      const result = await cache.getMany([]);
      expect(result.size).toBe(0);
      expect(mockRedis.mget).not.toHaveBeenCalled();
    });

    it("retrieves multiple cached metrics", async () => {
      const metrics1 = { ...mockMetrics, campaignId: "c1" };
      const metrics2 = { ...mockMetrics, campaignId: "c2" };
      
      mockRedis.mget.mockResolvedValue([
        JSON.stringify(metrics1),
        null,
        JSON.stringify(metrics2),
      ]);

      const result = await cache.getMany(["c1", "c2", "c3"]);
      
      expect(result.size).toBe(2);
      expect(result.get("c1")).toEqual(metrics1);
      expect(result.get("c2")).toEqual(metrics2);
      expect(result.has("c3")).toBe(false);
      expect(mockRedis.mget).toHaveBeenCalledWith(
        "campaign:progress:c1",
        "campaign:progress:c2",
        "campaign:progress:c3"
      );
    });

    it("skips invalid JSON entries", async () => {
      mockRedis.mget.mockResolvedValue([
        JSON.stringify(mockMetrics),
        "invalid-json",
      ]);

      const result = await cache.getMany(["c1", "c2"]);
      
      expect(result.size).toBe(1);
      expect(result.get("c1")).toEqual(mockMetrics);
      expect(result.has("c2")).toBe(false);
    });

    it("returns empty map and logs error on Redis failure", async () => {
      mockRedis.mget.mockRejectedValue(new Error("Redis mget failed"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      
      const result = await cache.getMany(["c1", "c2"]);
      
      expect(result.size).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
