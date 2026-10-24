import { afterEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { CampaignDonationService } from "./campaign-donation.service";
import { campaignReferralService } from "./campaign-referral.service";

const CAMPAIGN_ID = "referral-integration-campaign";

afterEach(() => campaignReferralService.reset());

describe("campaign referral donation attribution", () => {
  it("counts a confirmed referred donation and raises its amount under the right token", async () => {
    const source = new InMemoryCampaignDataSource();
    await createCampaign({ id: CAMPAIGN_ID, creator: "GCREATOR", name: "Referral campaign", goalAmount: "1000" }, source, 1);
    const campaign = (await source.getCampaigns())[0];
    await source.saveCampaign({ ...campaign, status: "ACTIVE" });

    const referral = campaignReferralService.createOrGetLink(CAMPAIGN_ID, "GREFERRER");
    campaignReferralService.recordClick(referral.code);
    const donations = new CampaignDonationService();
    const result = await donations.donate({
      campaignId: CAMPAIGN_ID,
      donorAddress: "GDONOR",
      amount: "12",
      token: "USDC",
      referralCode: referral.code,
    }, source, 42);

    expect(result.ok).toBe(true);
    expect(campaignReferralService.getStats(referral.code, "GREFERRER")).toEqual({
      clicks: 1,
      conversions: 1,
      amountRaisedByToken: { USDC: "12" },
    });
  });
});
