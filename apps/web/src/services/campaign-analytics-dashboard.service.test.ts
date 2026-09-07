import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCampaignAnalyticsDashboard,
  getCampaignAnalyticsDashboard,
  recordBackerContribution,
  recordFunnelStep,
  recordTrafficSource,
  resolveRewardTier,
} from "./campaign-analytics-dashboard.service";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";

describe("campaign analytics dashboard", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "analytics-dashboard-test";
  const DAY = 86_400_000;

  beforeEach(async () => {
    clearCampaignAnalyticsDashboard(campaignId);
    await createCampaign({ id: campaignId, creator: "creator", name: "Test", goalAmount: "10000" }, dataSource);
  });

  it("reports traffic sources with visitor counts and share", async () => {
    await recordTrafficSource(campaignId, "social", "v1", dataSource);
    await recordTrafficSource(campaignId, "social", "v1", dataSource);
    await recordTrafficSource(campaignId, "search", "v2", dataSource);
    await recordTrafficSource(campaignId, "direct", "v3", dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const social = dashboard?.trafficSources.find((item) => item.source === "social");
    expect(social).toMatchObject({ source: "social", visitors: 1, views: 2, label: "Social" });
    expect(dashboard?.trafficSources.reduce((sum, item) => sum + item.views, 0)).toBe(4);
  });

  it("builds a conversion funnel with rates and drop-off", async () => {
    await recordFunnelStep(campaignId, "view", "v1", dataSource);
    await recordFunnelStep(campaignId, "view", "v2", dataSource);
    await recordFunnelStep(campaignId, "click_sponsor", "v1", dataSource);
    await recordFunnelStep(campaignId, "contribute", "v1", dataSource);
    await recordFunnelStep(campaignId, "confirm", "v1", dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const funnel = dashboard!.funnel;
    expect(funnel[0]).toMatchObject({ stage: "view", count: 2, conversionRate: 100, dropoffRate: 0 });
    expect(funnel[1]).toMatchObject({ stage: "click_sponsor", count: 1, conversionRate: 50, dropoffRate: 50 });
    expect(funnel[3]).toMatchObject({ stage: "confirm", count: 1, conversionRate: 50 });
    expect(dashboard?.totals.conversionRate).toBe(50);
  });

  it("tracks daily funding trends and cumulative totals", async () => {
    const start = Date.UTC(2026, 7, 1);
    await recordBackerContribution(campaignId, {
      amount: "1000",
      backerId: "b1",
      region: "KE",
      at: start,
    }, dataSource);
    await recordBackerContribution(campaignId, {
      amount: "500",
      backerId: "b2",
      region: "NG",
      at: start + DAY,
    }, dataSource);
    await recordBackerContribution(campaignId, {
      amount: "250",
      backerId: "b2",
      region: "NG",
      at: start + DAY,
    }, dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const trend = dashboard?.dailyTrend ?? [];
    expect(trend.map((point) => point.date)).toEqual(["2026-08-01", "2026-08-02"]);
    expect(trend[0]).toMatchObject({ amount: "1000", contributions: 1, cumulative: "1000" });
    expect(trend[1]).toMatchObject({ amount: "750", contributions: 2, cumulative: "1750" });
    expect(dashboard?.totals.totalFunded).toBe("1750");
  });

  it("aggregates backer demographics by region", async () => {
    await recordBackerContribution(campaignId, { amount: "1000", backerId: "b1", region: "KE", at: 1 }, dataSource);
    await recordBackerContribution(campaignId, { amount: "500", backerId: "b2", region: "NG", at: 2 }, dataSource);
    await recordBackerContribution(campaignId, { amount: "250", backerId: "b1", region: "KE", at: 3 }, dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const ke = dashboard?.demographics.find((item) => item.region === "KE");
    expect(ke).toMatchObject({ region: "KE", backers: 1, totalAmount: "1250" });
  });

  it("computes reward tier popularity by revenue", async () => {
    await recordBackerContribution(campaignId, { amount: "10000", backerId: "b1", at: 1 }, dataSource);
    await recordBackerContribution(campaignId, { amount: "300", backerId: "b2", at: 2 }, dataSource);
    await recordBackerContribution(campaignId, { amount: "300", backerId: "b3", at: 3 }, dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const tiers = dashboard?.rewardTiers ?? [];
    expect(tiers[0]).toMatchObject({ tierId: "TIER_5", name: "Legendary Guardian", backers: 1, revenue: "10000" });
    const supporter = tiers.find((tier) => tier.tierId === "TIER_2");
    expect(supporter).toMatchObject({ tierId: "TIER_2", backers: 2, revenue: "600", share: 66.7 });
  });

  it("resolves the reward tier for an amount", () => {
    expect(resolveRewardTier(99n).tierId).toBe("TIER_1");
    expect(resolveRewardTier(100n).tierId).toBe("TIER_1");
    expect(resolveRewardTier(250n).tierId).toBe("TIER_2");
    expect(resolveRewardTier(5000n).tierId).toBe("TIER_5");
  });

  it("requires an existing campaign", async () => {
    await expect(recordTrafficSource("missing", "direct", "v1", dataSource)).rejects.toThrow("Campaign not found");
    expect(await getCampaignAnalyticsDashboard("missing", dataSource)).toBeNull();
  });
});