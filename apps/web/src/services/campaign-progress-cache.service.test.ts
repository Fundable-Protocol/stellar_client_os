import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCampaignProgressCacheKey,
  CampaignProgressCacheService,
  DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS,
} from "./campaign-progress-cache.service";
import * as campaignService from "./campaign.service";

const baseMetrics = {
  treeCount: 500,
  sponsorCount: 20,
  co2ImpactKg: 10000,
  co2SequestrationTonnes: "10.00",
  raisedAmount: "5000",
  goalAmount: "20000",
};

describe("CampaignProgressCacheService", () => {
  let cacheService: CampaignProgressCacheService;

  beforeEach(() => {
    vi.useFakeTimers();
    cacheService = new CampaignProgressCacheService(300); // 5 minutes
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns null on cache miss", () => {
    const result = cacheService.get("campaign-1");
    expect(result).toBeNull();
    expect(cacheService.getStats().misses).toBe(1);
  });

  it("stores and retrieves progress metrics within TTL", () => {
    const stored = cacheService.set("c-1", {
      campaignId: "c-1",
      treeCount: 500,
      sponsorCount: 20,
      co2ImpactKg: 10000,
      co2SequestrationTonnes: "10.00",
      raisedAmount: "5000",
      goalAmount: "20000",
    });

    expect(stored.campaignId).toBe("c-1");
    expect(stored.ttlSeconds).toBe(300);

    const retrieved = cacheService.get("c-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.treeCount).toBe(500);
    expect(cacheService.getStats().hits).toBe(1);
  });

  it("expires entries after 5 minutes (300 seconds)", () => {
    cacheService.set("c-1", {
      campaignId: "c-1",
      treeCount: 500,
      sponsorCount: 20,
      co2ImpactKg: 10000,
      co2SequestrationTonnes: "10.00",
      raisedAmount: "5000",
      goalAmount: "20000",
    });

    // Advance time by 4 minutes 59 seconds: should still hit
    vi.advanceTimersByTime(299 * 1000);
    expect(cacheService.get("c-1")).not.toBeNull();

    // Advance time by another 2 seconds: past 5 minutes, should expire
    vi.advanceTimersByTime(2 * 1000);
    expect(cacheService.get("c-1")).toBeNull();
    expect(cacheService.getStats().misses).toBe(1);
  });

  it("fetches from database on cache miss and caches result", async () => {
    vi.spyOn(campaignService, "getCampaign").mockResolvedValue({
      id: "c-fetch",
      name: "Fetch Camp",
      treeCount: 1200,
      sponsorCount: 40,
      co2Sequestration: "24.00",
      raisedAmount: "15000",
      goalAmount: "30000",
    } as any);

    const first = await cacheService.getOrFetch("c-fetch");
    expect(first.cacheHit).toBe(false);
    expect(first.metrics.treeCount).toBe(1200);
    expect(first.metrics.co2ImpactKg).toBe(1200 * 20);

    // Second call should hit cache without calling getCampaign again
    const second = await cacheService.getOrFetch("c-fetch");
    expect(second.cacheHit).toBe(true);
    expect(second.metrics.treeCount).toBe(1200);
    expect(campaignService.getCampaign).toHaveBeenCalledTimes(1);
  });

  it("forceRefresh bypasses cache and updates stored metrics", async () => {
    const spy = vi.spyOn(campaignService, "getCampaign").mockResolvedValue({
      id: "c-refresh",
      name: "Refresh Camp",
      treeCount: 100,
      sponsorCount: 5,
      raisedAmount: "1000",
      goalAmount: "5000",
    } as any);

    await cacheService.getOrFetch("c-refresh");
    expect(spy).toHaveBeenCalledTimes(1);

    // Update returned mock
    spy.mockResolvedValueOnce({
      id: "c-refresh",
      name: "Refresh Camp",
      treeCount: 200,
      sponsorCount: 10,
      raisedAmount: "2000",
      goalAmount: "5000",
    } as any);

    const refreshed = await cacheService.getOrFetch("c-refresh", true);
    expect(refreshed.cacheHit).toBe(false);
    expect(refreshed.metrics.treeCount).toBe(200);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("invalidates cache entries manually", () => {
    cacheService.set("c-inv", {
      campaignId: "c-inv",
      treeCount: 10,
      sponsorCount: 1,
      co2ImpactKg: 200,
      co2SequestrationTonnes: "0.20",
      raisedAmount: "100",
      goalAmount: "1000",
    });

    expect(cacheService.get("c-inv")).not.toBeNull();
    const removed = cacheService.invalidate("c-inv");
    expect(removed).toBe(true);
    expect(cacheService.get("c-inv")).toBeNull();
  });

  it("namespaces cache keys per campaign so params cannot collide", () => {
    expect(buildCampaignProgressCacheKey("campaign-abc")).toBe(
      "campaign:progress:campaign-abc"
    );
    expect(buildCampaignProgressCacheKey("campaign-abc")).not.toBe(
      buildCampaignProgressCacheKey("campaign-xyz")
    );
  });

  it("isolates cached entries per campaign key", () => {
    cacheService.set("c-a", { campaignId: "c-a", ...baseMetrics, treeCount: 1 });
    cacheService.set("c-b", { campaignId: "c-b", ...baseMetrics, treeCount: 2 });

    expect(cacheService.get("c-a")?.treeCount).toBe(1);
    expect(cacheService.get("c-b")?.treeCount).toBe(2);

    expect(cacheService.invalidate("c-a")).toBe(true);
    expect(cacheService.get("c-a")).toBeNull();
    expect(cacheService.get("c-b")?.treeCount).toBe(2);
  });

  it("returns unchanged metrics on a cache hit even if the source changes", async () => {
    const spy = vi
      .spyOn(campaignService, "getCampaign")
      .mockResolvedValue({
        id: "c-stable",
        name: "Stable",
        treeCount: 300,
        sponsorCount: 12,
        co2Sequestration: "6.00",
        raisedAmount: "3000",
        goalAmount: "9000",
      } as any);

    const first = await cacheService.getOrFetch("c-stable");
    const snapshot = { ...first.metrics };

    spy.mockResolvedValue({
      id: "c-stable",
      name: "Stable",
      treeCount: 999,
      sponsorCount: 99,
      raisedAmount: "9999",
      goalAmount: "9999",
    } as any);

    vi.advanceTimersByTime(60 * 1000);
    const second = await cacheService.getOrFetch("c-stable");

    expect(second.cacheHit).toBe(true);
    expect(second.metrics).toEqual(snapshot);
    expect(second.metrics.treeCount).toBe(300);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("honors an injectable clock for expiry", () => {
    let now = 1_000_000;
    const clocked = new CampaignProgressCacheService({
      ttlSeconds: DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS,
      now: () => now,
    });

    const stored = clocked.set("c-clock", { campaignId: "c-clock", ...baseMetrics });
    expect(stored.cachedAt).toBe(1_000_000);
    expect(stored.expiresAt).toBe(1_000_000 + 300 * 1000);

    now += 299 * 1000;
    expect(clocked.get("c-clock")).not.toBeNull();

    now += 2 * 1000;
    expect(clocked.get("c-clock")).toBeNull();
  });

  it("reads the default TTL from CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS", () => {
    const original = process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
    try {
      process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS = "60";
      const envCache = new CampaignProgressCacheService();
      const stored = envCache.set("c-env", { campaignId: "c-env", ...baseMetrics });
      expect(stored.ttlSeconds).toBe(60);
    } finally {
      if (original === undefined) {
        delete process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
      } else {
        process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS = original;
      }
    }
  });

  it("falls back to the 5-minute default for an invalid env TTL", () => {
    const original = process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
    try {
      process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS = "not-a-number";
      const envCache = new CampaignProgressCacheService();
      const stored = envCache.set("c-env-bad", { campaignId: "c-env-bad", ...baseMetrics });
      expect(stored.ttlSeconds).toBe(DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS);
    } finally {
      if (original === undefined) {
        delete process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
      } else {
        process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS = original;
      }
    }
  });
});