import { afterEach, describe, expect, it } from "vitest";
import { campaignReferralService } from "@/services/campaign-referral.service";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { GET, PUT } from "./route";

const CAMPAIGN_ID = "creator-referral-api-campaign";
const params = Promise.resolve({ id: CAMPAIGN_ID });

async function seedCampaign() {
  const source = new InMemoryCampaignDataSource();
  await createCampaign({ id: CAMPAIGN_ID, creator: "GCREATOR", name: "Creator campaign", goalAmount: "1000" }, source, 1);
  setCampaignDataSource(source);
}

afterEach(() => {
  campaignReferralService.reset();
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

describe("campaign referral reward configuration", () => {
  it("requires the campaign creator and stores a bounded optional top-referrer reward", async () => {
    await seedCampaign();
    const denied = await PUT(new Request("https://fundable.test", { method: "PUT", body: JSON.stringify({ creatorAddress: "GOTHER", rewardDescription: "Prize", recipientCount: 2 }) }), { params });
    expect(denied.status).toBe(403);

    const response = await PUT(new Request("https://fundable.test", { method: "PUT", body: JSON.stringify({ creatorAddress: "gcreator", rewardDescription: "Exclusive merchandise", recipientCount: 2 }) }), { params });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ referralReward: { description: "Exclusive merchandise", recipientCount: 2 } });
  });

  it("only exposes a campaign referral leaderboard to its creator", async () => {
    await seedCampaign();
    const link = campaignReferralService.createOrGetLink(CAMPAIGN_ID, "GBACKER");
    campaignReferralService.recordClick(link.code);
    const denied = await GET(new Request("https://fundable.test/api?creator=GOTHER"), { params });
    expect(denied.status).toBe(403);
    const response = await GET(new Request("https://fundable.test/api?creator=GCREATOR"), { params });
    expect((await response.json()).leaderboard[0]).toMatchObject({ backerAddress: "GBACKER", clicks: 1, conversions: 0 });
  });
});
