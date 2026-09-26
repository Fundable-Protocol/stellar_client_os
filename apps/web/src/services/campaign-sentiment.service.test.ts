import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import {
  analyzeCampaignFeedback,
  clearCampaignSentiment,
  getCampaignSentiment,
  recordCampaignFeedback,
} from "./campaign-sentiment.service";

describe("campaign sentiment", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "campaign-sentiment-test";

  beforeEach(async () => {
    clearCampaignSentiment(campaignId);
    await createCampaign({ id: campaignId, creator: "creator", name: "Test", goalAmount: "10000" }, dataSource);
  });

  it("scores sentiment from comments and accounts for negation and ratings", () => {
    expect(analyzeCampaignFeedback({ sponsorAddress: "sponsor", comment: "The team delivered great results" })).toBeGreaterThan(0);
    expect(analyzeCampaignFeedback({ sponsorAddress: "sponsor", comment: "The team was not great" })).toBeLessThan(0);
    expect(analyzeCampaignFeedback({ sponsorAddress: "sponsor", comment: "A good campaign", rating: 1 })).toBeLessThan(0);
  });

  it("flags consistently low sentiment once enough sponsor feedback exists", async () => {
    await recordCampaignFeedback(campaignId, { sponsorAddress: "sponsor-1", comment: "Very disappointed and frustrated", rating: 1 }, dataSource);
    await recordCampaignFeedback(campaignId, { sponsorAddress: "sponsor-2", comment: "Poor communication and missing updates", rating: 2 }, dataSource);
    const result = await recordCampaignFeedback(campaignId, { sponsorAddress: "sponsor-3", comment: "Terrible, late, and unresponsive", rating: 1 }, dataSource);

    expect(result).toMatchObject({
      feedbackCount: 3,
      negativeCount: 3,
      needsOutreach: true,
    });
  });

  it("does not flag small samples and validates feedback", async () => {
    const first = await recordCampaignFeedback(campaignId, { sponsorAddress: "sponsor-1", comment: "Terrible experience", rating: 1 }, dataSource);
    expect(first.needsOutreach).toBe(false);
    const updated = await recordCampaignFeedback(campaignId, { sponsorAddress: "SPONSOR-1", comment: "Great experience", rating: 5 }, dataSource);
    expect(updated.feedbackCount).toBe(1);
    expect(updated.needsOutreach).toBe(false);
    await expect(recordCampaignFeedback(campaignId, { sponsorAddress: "sponsor-2", comment: "fine", rating: 6 }, dataSource)).rejects.toThrow("rating must be an integer from 1 to 5");
    expect(await getCampaignSentiment("missing-campaign", dataSource)).toBeNull();
  });
});