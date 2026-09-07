import { beforeEach, describe, expect, it } from "vitest";
import {
  clearCampaignAnalytics,
  getCampaignAnalytics,
  recordCampaignContribution,
  recordCampaignRefund,
  recordCampaignView,
} from "./campaign-analytics.service";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";

describe("campaign analytics (#705)", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "campaign-analytics-test";

  beforeEach(async () => {
    clearCampaignAnalytics(campaignId);
    await createCampaign({ id: campaignId, creator: "creator", name: "Test", goalAmount: "10000" }, dataSource);
  });

  it("tracks page views separately from unique viewers", async () => {
    await recordCampaignView(campaignId, "viewer-1", dataSource);
    await recordCampaignView(campaignId, "viewer-1", dataSource);
    await recordCampaignView(campaignId, "viewer-2", dataSource);

    const result = await getCampaignAnalytics(campaignId, dataSource, 123);
    expect(result).toMatchObject({ pagesViewed: 3, uniqueViewers: 2, sponsorRate: 0, abandonmentRate: 100, updatedAt: 123 });
  });

  it("calculates conversion, average contribution, and refund rate", async () => {
    await recordCampaignView(campaignId, "viewer-1", dataSource);
    await recordCampaignView(campaignId, "viewer-2", dataSource);
    await recordCampaignContribution(campaignId, "1000", "sponsor-1", dataSource);
    await recordCampaignContribution(campaignId, "3000", "sponsor-2", dataSource);
    await recordCampaignRefund(campaignId, dataSource);

    const result = await getCampaignAnalytics(campaignId, dataSource);
    expect(result).toMatchObject({
      pagesViewed: 2,
      sponsors: 2,
      contributions: 2,
      sponsorRate: 100,
      abandonmentRate: 0,
      averageContributionSize: "2000",
      refunds: 1,
      refundRate: 50,
    });
  });
});
