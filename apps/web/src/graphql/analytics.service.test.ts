// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  AnalyticsService,
  type StreamRecord,
  type StreamDataSource,
} from "./analytics.service";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const USDC = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const XLM  = "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4";

const STREAMS: StreamRecord[] = [
  {
    id: "1",
    sender: "GAAA",
    recipient: "GPROJ1",
    asset: USDC,
    symbol: "USDC",
    totalAmount: "1000000000",
    status: "Active",
    createdAt: 1700000000,
    region: "NG",
    category: "climate",
    usdEquivalent: "100",
  },
  {
    id: "2",
    sender: "GBBB",
    recipient: "GPROJ2",
    asset: USDC,
    symbol: "USDC",
    totalAmount: "2000000000",
    status: "Active",
    createdAt: 1700001000,
    region: "NG",
    category: "education",
    usdEquivalent: "200",
  },
  {
    id: "3",
    sender: "GCCC",
    recipient: "GPROJ3",
    asset: XLM,
    symbol: "XLM",
    totalAmount: "500000000",
    status: "Completed",
    createdAt: 1700002000,
    region: "GH",
    category: "climate",
    usdEquivalent: "50",
  },
  {
    id: "4",
    sender: "GDDD",
    recipient: "GPROJ4",
    asset: XLM,
    symbol: "XLM",
    totalAmount: "300000000",
    status: "Paused",
    createdAt: 1700003000,
    region: "GH",
    category: "health",
    usdEquivalent: "30",
  },
  {
    id: "5",
    sender: "GAAA",
    recipient: "GPROJ5",
    asset: USDC,
    symbol: "USDC",
    totalAmount: "750000000",
    status: "Canceled",
    createdAt: 1700004000,
    region: undefined,   // → "GLOBAL"
    category: undefined, // → "uncategorized"
    usdEquivalent: "75",
  },
];

function makeSource(records: StreamRecord[] = STREAMS): StreamDataSource {
  return { getStreams: async () => records };
}

// ── globalMetrics ─────────────────────────────────────────────────────────────

describe("AnalyticsService.getGlobalMetrics", () => {
  it("returns correct totalStreams", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    expect(m.totalStreams).toBe(5);
  });

  it("counts only Active streams", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    expect(m.activeStreams).toBe(2);
  });

  it("sums usdEquivalent across all streams", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    // 100 + 200 + 50 + 30 + 75 = 455
    expect(m.totalVolumeUsd).toBe("455");
  });

  it("counts unique assets", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    expect(m.uniqueAssets).toBe(2);
  });

  it("counts unique regions (including GLOBAL for untagged)", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    // NG, GH, GLOBAL
    expect(m.uniqueRegions).toBe(3);
  });

  it("counts unique categories (excluding undefined)", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    // climate, education, health (uncategorized is excluded)
    expect(m.uniqueCategories).toBe(3);
  });

  it("returns latestStreamAt as the max createdAt", async () => {
    const svc = new AnalyticsService(makeSource());
    const m = await svc.getGlobalMetrics();
    expect(m.latestStreamAt).toBe(1700004000);
  });

  it("returns zero metrics for an empty data source", async () => {
    const svc = new AnalyticsService(makeSource([]));
    const m = await svc.getGlobalMetrics();
    expect(m.totalStreams).toBe(0);
    expect(m.activeStreams).toBe(0);
    expect(m.totalVolumeUsd).toBe("0");
    expect(m.latestStreamAt).toBeNull();
  });
});

// ── regionMetrics ─────────────────────────────────────────────────────────────

describe("AnalyticsService.getRegionMetrics", () => {
  it("returns one entry per distinct region", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics();
    const regions = results.map((r) => r.region).sort();
    expect(regions).toContain("NG");
    expect(regions).toContain("GH");
    expect(regions).toContain("GLOBAL");
  });

  it("filters by region", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics({ region: "NG" });
    expect(results).toHaveLength(1);
    expect(results[0].region).toBe("NG");
    expect(results[0].totalStreams).toBe(2);
  });

  it("filters by asset", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics({ asset: XLM });
    // Only GH streams use XLM
    expect(results.every((r) => r.assetBreakdown.some((a) => a.asset === XLM))).toBe(true);
  });

  it("filters by status", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics({ status: "Active" });
    const totalStreams = results.reduce((s, r) => s + r.totalStreams, 0);
    expect(totalStreams).toBe(2); // only Active
  });

  it("filters by fromTimestamp", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics({ fromTimestamp: 1700002000 });
    const totalStreams = results.reduce((s, r) => s + r.totalStreams, 0);
    expect(totalStreams).toBe(3); // streams 3, 4, 5
  });

  it("counts projectCount as unique recipients per region", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics({ region: "NG" });
    expect(results[0].projectCount).toBe(2); // GPROJ1, GPROJ2
  });

  it("includes assetBreakdown per region", async () => {
    const svc = new AnalyticsService(makeSource());
    const ng = (await svc.getRegionMetrics({ region: "NG" }))[0];
    expect(ng.assetBreakdown).toHaveLength(1); // only USDC in NG
    expect(ng.assetBreakdown[0].asset).toBe(USDC);
    expect(ng.assetBreakdown[0].streamCount).toBe(2);
  });

  it("respects pagination limit", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getRegionMetrics(undefined, { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("respects pagination offset", async () => {
    const svc = new AnalyticsService(makeSource());
    const all = await svc.getRegionMetrics();
    const paged = await svc.getRegionMetrics(undefined, { offset: 1, limit: 1 });
    expect(paged[0].region).toBe(all[1].region);
  });

  it("returns empty array for empty data source", async () => {
    const svc = new AnalyticsService(makeSource([]));
    expect(await svc.getRegionMetrics()).toHaveLength(0);
  });
});

// ── categoryMetrics ───────────────────────────────────────────────────────────

describe("AnalyticsService.getCategoryMetrics", () => {
  it("returns one entry per distinct category", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getCategoryMetrics();
    const cats = results.map((c) => c.category);
    expect(cats).toContain("climate");
    expect(cats).toContain("education");
    expect(cats).toContain("health");
    expect(cats).toContain("uncategorized");
  });

  it("sharePercent sums to 100 across all categories", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getCategoryMetrics();
    const sum = results.reduce((s, c) => s + c.sharePercent, 0);
    expect(Math.round(sum)).toBe(100);
  });

  it("filters by category", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getCategoryMetrics({ category: "climate" });
    expect(results).toHaveLength(1);
    expect(results[0].category).toBe("climate");
    expect(results[0].totalStreams).toBe(2); // streams 1 and 3
  });

  it("filters by status", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getCategoryMetrics({ status: "Completed" });
    const totalStreams = results.reduce((s, c) => s + c.totalStreams, 0);
    expect(totalStreams).toBe(1); // only stream 3
  });

  it("includes assetBreakdown per category", async () => {
    const svc = new AnalyticsService(makeSource());
    const climate = (await svc.getCategoryMetrics({ category: "climate" }))[0];
    expect(climate.assetBreakdown.length).toBeGreaterThan(0);
  });

  it("returns empty array for empty data source", async () => {
    expect(await new AnalyticsService(makeSource([])).getCategoryMetrics()).toHaveLength(0);
  });
});

// ── assetMetrics ──────────────────────────────────────────────────────────────

describe("AnalyticsService.getAssetMetrics", () => {
  it("returns one entry per distinct asset", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics();
    expect(results).toHaveLength(2);
  });

  it("sorts by totalVolume descending", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics();
    const v0 = BigInt(results[0].totalVolume);
    const v1 = BigInt(results[1].totalVolume);
    expect(v0 >= v1).toBe(true);
  });

  it("aggregates totalVolume correctly for USDC", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics({ asset: USDC });
    expect(results).toHaveLength(1);
    // streams 1, 2, 5 use USDC: 1B + 2B + 750M = 3750000000
    expect(results[0].totalVolume).toBe("3750000000");
    expect(results[0].streamCount).toBe(3);
  });

  it("computes uniqueSenders correctly", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics({ asset: USDC });
    // GAAA used USDC twice (streams 1, 5), GBBB once
    expect(results[0].uniqueSenders).toBe(2);
  });

  it("computes averageStreamAmount", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics({ asset: USDC });
    // (1B + 2B + 750M) / 3 = 1250000000
    expect(results[0].averageStreamAmount).toBe("1250000000");
  });

  it("filters by status", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics({ status: "Active" });
    const totalCount = results.reduce((s, a) => s + a.streamCount, 0);
    expect(totalCount).toBe(2); // streams 1, 2
  });

  it("filters by fromTimestamp", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics({ fromTimestamp: 1700002000 });
    const totalCount = results.reduce((s, a) => s + a.streamCount, 0);
    expect(totalCount).toBe(3); // streams 3, 4, 5
  });

  it("respects pagination", async () => {
    const svc = new AnalyticsService(makeSource());
    const results = await svc.getAssetMetrics(undefined, { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("returns empty array for empty data source", async () => {
    expect(await new AnalyticsService(makeSource([])).getAssetMetrics()).toHaveLength(0);
  });
});
