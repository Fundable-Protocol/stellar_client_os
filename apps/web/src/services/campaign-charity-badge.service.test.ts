import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaign, InMemoryCampaignDataSource } from "./campaign.service";
import { CharityBadgeError, awardCharityBadge, revokeCharityBadge } from "./campaign-charity-badge.service";

describe("campaign charity badge", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "charity-badge-campaign";

  beforeEach(async () => {
    await createCampaign({ id: campaignId, creator: "creator", name: "Food Bank", goalAmount: "1000" }, dataSource, 1);
  });

  it("awards a badge with documentation link and audit fields", async () => {
    const campaign = await awardCharityBadge(
      campaignId,
      { type: "TAX_EXEMPT", documentationUrl: " https://example.org/irs-letter.pdf ", awardedBy: " admin " },
      dataSource,
      50,
    );
    expect(campaign.charityBadge).toEqual({
      type: "TAX_EXEMPT",
      documentationUrl: "https://example.org/irs-letter.pdf",
      awardedBy: "admin",
      awardedAt: 50,
    });
  });

  it("replaces an existing badge and then revokes it", async () => {
    await awardCharityBadge(campaignId, { type: "TAX_EXEMPT", documentationUrl: "https://a.org/x", awardedBy: "admin" }, dataSource, 5);
    const replaced = await awardCharityBadge(campaignId, { type: "CHARITY_VERIFIED", documentationUrl: "https://a.org/y", awardedBy: "admin" }, dataSource, 6);
    expect(replaced.charityBadge?.type).toBe("CHARITY_VERIFIED");

    const revoked = await revokeCharityBadge(campaignId, dataSource, 7);
    expect(revoked.charityBadge).toBeUndefined();
  });

  it.each([
    [{ type: "GOLD", documentationUrl: "https://a.org", awardedBy: "admin" }],
    [{ type: "TAX_EXEMPT", documentationUrl: "", awardedBy: "admin" }],
    [{ type: "TAX_EXEMPT", documentationUrl: "not a url", awardedBy: "admin" }],
    [{ type: "TAX_EXEMPT", documentationUrl: "javascript:alert(1)", awardedBy: "admin" }],
    [{ type: "TAX_EXEMPT", documentationUrl: "https://a.org", awardedBy: " " }],
  ])("rejects invalid input %#", async (input) => {
    await expect(awardCharityBadge(campaignId, input, dataSource)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("reports a missing campaign", async () => {
    await expect(
      awardCharityBadge("missing", { type: "TAX_EXEMPT", documentationUrl: "https://a.org", awardedBy: "admin" }, dataSource),
    ).rejects.toBeInstanceOf(CharityBadgeError);
  });
});
