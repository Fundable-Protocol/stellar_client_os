import { describe, expect, it } from "vitest";
import {
  AdminCampaignAnalyticsService,
  DEFAULT_ANALYTICS_WINDOW_DAYS,
  DefaultAdminAnalyticsDataSource,
  computeAdminCampaignAnalytics,
  demoSponsorships,
  normalizeWindowDays,
  stroopsToXlm,
  type SponsorshipEvent,
} from "./admin-campaign-analytics.service";
import type { CampaignImpactRecord } from "./campaign-impact-leaderboard.service";

const DAY = 86_400;
const NOW = 100 * DAY;

function campaign(overrides: Partial<CampaignImpactRecord>): CampaignImpactRecord {
  return {
    id: "1",
    title: "Campaign",
    creator: "GCREATOR",
    status: "Active",
    createdAt: 0,
    completedAt: null,
    targetAmount: "100000000",
    totalRaised: "0",
    sponsorCount: 0,
    species: [],
    ...overrides,
  };
}

const CAMPAIGNS: CampaignImpactRecord[] = [
  campaign({ id: "a", status: "Active", totalRaised: "20000000", species: [{ speciesId: "teak", trees: 100 }] }),
  campaign({ id: "b", status: "Successful", totalRaised: "10000000", species: [{ speciesId: "pine", trees: 50 }] }),
  campaign({ id: "c", status: "Claimed", totalRaised: "not-a-number" }),
  campaign({ id: "d", status: "Failed", totalRaised: "5", species: [{ speciesId: "oak", trees: 10 }] }),
];

const event = (sponsorAddress: string, day: number, amount = "10000000"): SponsorshipEvent => ({
  campaignId: "a",
  sponsorAddress,
  amount,
  at: Math.round(day * DAY),
});

// Window: [70d, 100d). Previous window: [40d, 70d).
const EVENTS: SponsorshipEvent[] = [
  event("s1", 10),
  event("s1", 75), // returning sponsor: revenue in window, but not a new sponsor
  event("s2", 45, "20000000"),
  event("s3", 71.01, "30000000"),
  event("s4", 71.02),
  event("s6", 99, "0"),
  event("s5", 100), // at `now`: outside the window
  event("s7", 120), // in the future: ignored
];

describe("computeAdminCampaignAnalytics", () => {
  const analytics = computeAdminCampaignAnalytics(CAMPAIGNS, EVENTS, { now: NOW });

  it("counts campaigns by status", () => {
    expect(analytics.campaigns).toEqual({ total: 4, active: 1, successful: 1, claimed: 1, failed: 1 });
  });

  it("totals trees planted and CO2 sequestered", () => {
    expect(analytics.trees.planted).toBe(160);
    // 100 teak * 24 + 50 pine * 18 + 10 oak * 21
    expect(analytics.co2).toEqual({
      sequesteredPerYearKg: 3510,
      sequesteredPerYearTonnes: 3.51,
      projectedOver10YearsTonnes: 35.1,
    });
  });

  it("computes the completion rate over campaigns that have ended", () => {
    expect(analytics.completion).toEqual({ ended: 3, completed: 2, rate: 0.6667 });
  });

  it("has no completion rate before any campaign ends", () => {
    const result = computeAdminCampaignAnalytics([campaign({})], [], { now: NOW });

    expect(result.completion.rate).toBeNull();
  });

  it("totals revenue exactly and compares the window to the previous one", () => {
    expect(analytics.revenue).toEqual({
      totalStroops: "30000005",
      totalXlm: 3.0000005,
      inWindowXlm: 5,
      previousWindowXlm: 2,
      growthRate: 1.5,
    });
  });

  it("measures sponsor growth by when each sponsor first appeared", () => {
    expect(analytics.sponsors).toMatchObject({
      total: 5,
      newInWindow: 3,
      newInPreviousWindow: 1,
      growthRate: 2,
    });
  });

  it("builds a daily cumulative sponsor series across the window", () => {
    const { daily } = analytics.sponsors;

    expect(daily).toHaveLength(DEFAULT_ANALYTICS_WINDOW_DAYS);
    expect(daily[0]).toEqual({ date: "1970-03-12", newSponsors: 0, totalSponsors: 2 });
    expect(daily[1]).toEqual({ date: "1970-03-13", newSponsors: 2, totalSponsors: 4 });
    expect(daily[29]).toEqual({ date: "1970-04-10", newSponsors: 1, totalSponsors: 5 });
  });

  it("reports no growth rate without a previous-window baseline", () => {
    const result = computeAdminCampaignAnalytics([], [event("x", 99)], { now: NOW });

    expect(result.sponsors.growthRate).toBeNull();
    expect(result.revenue.growthRate).toBeNull();
  });

  it("describes the window it used", () => {
    const result = computeAdminCampaignAnalytics([], [], { now: NOW, windowDays: 7, network: "mainnet" });

    expect(result.window).toEqual({ days: 7, start: NOW - 7 * DAY, end: NOW });
    expect(result.sponsors.daily).toHaveLength(7);
    expect(result.network).toBe("mainnet");
    expect(result.generatedAt).toBe(NOW);
  });
});

describe("helpers", () => {
  it("clamps the window to 1–365 days", () => {
    expect(normalizeWindowDays(undefined)).toBe(30);
    expect(normalizeWindowDays(Number.NaN)).toBe(30);
    expect(normalizeWindowDays(0)).toBe(1);
    expect(normalizeWindowDays(7.9)).toBe(7);
    expect(normalizeWindowDays(10_000)).toBe(365);
  });

  it("converts stroops to XLM without losing the fraction", () => {
    expect(stroopsToXlm(123_456_789_012_345_678n)).toBeCloseTo(12_345_678_901.2345678, 4);
    expect(stroopsToXlm(1n)).toBe(0.0000001);
  });

  it("generates demo sponsorships inside each campaign's lifetime", () => {
    const records = [
      campaign({ id: "x", sponsorCount: 4, totalRaised: "400", createdAt: 0, completedAt: 40 }),
      campaign({ id: "y", sponsorCount: 0 }),
    ];
    const events = demoSponsorships(records, NOW);

    expect(events).toHaveLength(4);
    expect(events.every((e) => e.at >= 0 && e.at < 40 && e.amount === "100")).toBe(true);
  });
});

describe("AdminCampaignAnalyticsService", () => {
  it("computes a snapshot from its data source and clock", async () => {
    const service = new AdminCampaignAnalyticsService({
      dataSource: { getCampaigns: async () => CAMPAIGNS, getSponsorships: async () => EVENTS },
      clock: () => NOW,
    });

    const snapshot = await service.getSnapshot({ windowDays: 30 });

    expect(snapshot.trees.planted).toBe(160);
    expect(snapshot.sponsors.total).toBe(5);
  });

  it("serves no demo data under test", async () => {
    const source = new DefaultAdminAnalyticsDataSource();

    await expect(source.getCampaigns()).resolves.toEqual([]);
    await expect(source.getSponsorships()).resolves.toEqual([]);
  });
});
