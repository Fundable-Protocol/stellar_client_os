import { afterEach, describe, expect, it } from "vitest";
import { backersService } from "@/services/campaign-backers.service";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { campaignReferralService } from "@/services/campaign-referral.service";
import { GET } from "./route";

const CAMPAIGN_ID = "backer-referral-api-campaign";

async function seedCampaign() {
  const source = new InMemoryCampaignDataSource();
  await createCampaign({ id: CAMPAIGN_ID, creator: "GCREATOR", name: "Test forest", goalAmount: "1000" }, source, 1);
  const campaign = (await source.getCampaigns())[0];
  await source.saveCampaign({ ...campaign, status: "ACTIVE" });
  setCampaignDataSource(source);
}

afterEach(() => {
  backersService.reset();
  campaignReferralService.reset();
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

describe("GET /api/backers/:address/referrals", () => {
  it("returns a stable short link and stats for each backed campaign", async () => {
    await seedCampaign();
    backersService.recordContribution({ campaignId: CAMPAIGN_ID, backerAddress: "GBACKER", amount: "25" });
    const params = Promise.resolve({ address: "GBACKER" });
    const first = await GET(new Request("https://fundable.test/api/backers/GBACKER/referrals"), { params });
    const firstBody = await first.json();
    const second = await GET(new Request("https://fundable.test/api/backers/GBACKER/referrals"), { params });
    const secondBody = await second.json();

    expect(first.status).toBe(200);
    expect(firstBody.campaigns).toHaveLength(1);
    expect(firstBody.campaigns[0]).toMatchObject({
      campaignId: CAMPAIGN_ID,
      campaignName: "Test forest",
      clicks: 0,
      conversions: 0,
      amountRaisedByToken: {},
    });
    expect(firstBody.campaigns[0].campaignUrl).toMatch(/^https:\/\/fundable\.test\/r\/[A-Za-z0-9_-]{8}$/);
    expect(secondBody.campaigns[0].code).toBe(firstBody.campaigns[0].code);
  });
});
