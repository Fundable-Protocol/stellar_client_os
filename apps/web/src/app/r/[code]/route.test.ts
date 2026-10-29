import { afterEach, describe, expect, it } from "vitest";
import { campaignReferralService } from "@/services/campaign-referral.service";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { GET } from "./route";

const CAMPAIGN_ID = "short-referral-route-campaign";

afterEach(() => {
  campaignReferralService.reset();
  setCampaignDataSource(new InMemoryCampaignDataSource());
});

describe("GET /r/:code", () => {
  it("counts clicks and redirects internally to the correct campaign with attribution", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: CAMPAIGN_ID, creator: "GCREATOR", name: "Short link target", goalAmount: "1000" }, source, 1);
    setCampaignDataSource(source);
    const link = campaignReferralService.createOrGetLink(CAMPAIGN_ID, "GBACKER");

    const response = await GET(new Request(`https://fundable.test/r/${link.code}`), { params: Promise.resolve({ code: link.code }) });

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://fundable.test/campaigns/${CAMPAIGN_ID}?ref=${link.code}`);
    expect(campaignReferralService.getStats(link.code)?.clicks).toBe(1);
  });

  it("returns 404 for an unknown referral code", async () => {
    const response = await GET(new Request("https://fundable.test/r/unknown"), { params: Promise.resolve({ code: "unknown" }) });
    expect(response.status).toBe(404);
  });
});
