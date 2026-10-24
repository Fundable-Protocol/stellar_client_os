// @vitest-environment node
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

  it("tracks hourly funding trends and cumulative totals for creator analytics", async () => {
    const baseHour = Date.UTC(2026, 7, 1, 10, 0, 0); // 10:00 UTC
    const ONE_HOUR = 3600 * 1000;
    await recordBackerContribution(campaignId, {
      amount: "400",
      backerId: "b1",
      at: baseHour + 15 * 60 * 1000, // 10:15
    }, dataSource);
    await recordBackerContribution(campaignId, {
      amount: "600",
      backerId: "b2",
      at: baseHour + 45 * 60 * 1000, // 10:45
    }, dataSource);
    await recordBackerContribution(campaignId, {
      amount: "800",
      backerId: "b3",
      at: baseHour + ONE_HOUR + 10 * 60 * 1000, // 11:10
    }, dataSource);

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    const hourly = dashboard?.hourlyTrend ?? [];
    expect(hourly).toHaveLength(2);
    expect(hourly[0]).toMatchObject({ hour: "2026-08-01T10:00", amount: "1000", contributions: 2, cumulative: "1000" });
    expect(hourly[1]).toMatchObject({ hour: "2026-08-01T11:00", amount: "800", contributions: 1, cumulative: "1800" });
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

  it("tracks visit-to-pledge conversion rate broken down by traffic source (direct, social, email, search)", async () => {
    // Record visitors from distinct referral sources
    await recordTrafficSource(campaignId, "direct", "v_dir_1", dataSource);
    await recordTrafficSource(campaignId, "direct", "v_dir_2", dataSource);

    await recordTrafficSource(campaignId, "social", "v_soc_1", dataSource);
    await recordTrafficSource(campaignId, "social", "v_soc_2", dataSource);
    await recordTrafficSource(campaignId, "social", "v_soc_3", dataSource);
    await recordTrafficSource(campaignId, "social", "v_soc_4", dataSource);

    await recordTrafficSource(campaignId, "email", "v_em_1", dataSource);
    await recordTrafficSource(campaignId, "email", "v_em_2", dataSource);

    await recordTrafficSource(campaignId, "search", "v_sea_1", dataSource);

    // Record pledges:
    // 1 direct backer converts (1 out of 2 = 50.0%)
    await recordBackerContribution(campaignId, { amount: "100", backerId: "v_dir_1" }, dataSource);
    // 2 social backers convert (2 out of 4 = 50.0%)
    await recordBackerContribution(campaignId, { amount: "250", backerId: "v_soc_1" }, dataSource);
    await recordBackerContribution(campaignId, { amount: "500", backerId: "v_soc_2" }, dataSource);
    // 2 email backers convert (2 out of 2 = 100.0%)
    await recordBackerContribution(campaignId, { amount: "1000", backerId: "v_em_1" }, dataSource);
    await recordBackerContribution(campaignId, { amount: "100", backerId: "v_em_2" }, dataSource);
    // 0 search backers convert (0 out of 1 = 0.0%)

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    expect(dashboard).not.toBeNull();

    const direct = dashboard?.trafficSources.find((s) => s.source === "direct");
    const social = dashboard?.trafficSources.find((s) => s.source === "social");
    const email = dashboard?.trafficSources.find((s) => s.source === "email");
    const search = dashboard?.trafficSources.find((s) => s.source === "search");

    expect(direct).toMatchObject({
      source: "direct",
      label: "Direct",
      visitors: 2,
      pledges: 1,
      conversionRate: 50,
    });
    expect(social).toMatchObject({
      source: "social",
      label: "Social",
      visitors: 4,
      pledges: 2,
      conversionRate: 50,
    });
    expect(email).toMatchObject({
      source: "email",
      label: "Email",
      visitors: 2,
      pledges: 2,
      conversionRate: 100,
    });
    expect(search).toMatchObject({
      source: "search",
      label: "Search",
      visitors: 1,
      pledges: 0,
      conversionRate: 0,
    });
  });

  it("builds a 3-step pledge funnel (visitors -> pledge initiated -> pledge completed)", async () => {
    // 10 visitors
    for (let i = 1; i <= 10; i++) {
      await recordTrafficSource(campaignId, "social", `visitor_${i}`, dataSource);
    }
    // 5 initiate pledge
    for (let i = 1; i <= 5; i++) {
      await recordFunnelStep(campaignId, "pledge_initiated", `visitor_${i}`, dataSource);
    }
    // 2 complete pledge
    for (let i = 1; i <= 2; i++) {
      await recordFunnelStep(campaignId, "pledge_completed", `visitor_${i}`, dataSource);
    }

    const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, 1);
    expect(dashboard?.pledgeFunnel).toBeDefined();
    const pledgeFunnel = dashboard!.pledgeFunnel!;

    expect(pledgeFunnel[0]).toMatchObject({
      stage: "visitors",
      label: "Visitors",
      count: 10,
      conversionRate: 100,
      dropoffRate: 0,
    });
    expect(pledgeFunnel[1]).toMatchObject({
      stage: "pledge_initiated",
      label: "Pledge initiated",
      count: 5,
      conversionRate: 50,
      dropoffRate: 50,
    });
    expect(pledgeFunnel[2]).toMatchObject({
      stage: "pledge_completed",
      label: "Pledge completed",
      count: 2,
      conversionRate: 20,
      dropoffRate: 60,
    });
  });

  it("requires an existing campaign", async () => {
    await expect(recordTrafficSource("missing", "direct", "v1", dataSource)).rejects.toThrow("Campaign not found");
    expect(await getCampaignAnalyticsDashboard("missing", dataSource)).toBeNull();
  });
});