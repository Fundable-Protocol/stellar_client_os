import { describe, expect, it } from "vitest";
import { buildCampaignShareLinks, buildCampaignShareMessage } from "./CampaignShareButtons";

describe("CampaignShareButtons", () => {
  const props = {
    campaignId: "campaign/42",
    campaignName: "Trees & clean water",
    description: "Plant 1,000 trees.",
    raisedAmount: "750",
    goalAmount: "1000",
    shareUrl: "https://fundable.example/campaigns/campaign%2F42",
  };

  it("builds an impact-oriented message", () => {
    expect(buildCampaignShareMessage(props)).toBe(
      "Support Trees & clean water! Plant 1,000 trees. 750/1000 raised.",
    );
  });

  it("encodes provider-specific share parameters", () => {
    const links = buildCampaignShareLinks(props);
    expect(new URL(links.twitter).searchParams.get("text")).toContain("Trees & clean water");
    expect(new URL(links.twitter).searchParams.get("url")).toBe(props.shareUrl);
    expect(new URL(links.facebook).searchParams.get("quote")).toContain("750/1000 raised.");
    expect(new URL(links.whatsapp).searchParams.get("text")).toContain(props.shareUrl);
  });
});
