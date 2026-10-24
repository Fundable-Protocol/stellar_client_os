import { describe, expect, it } from "vitest";
import { buildCampaignShareLinks, buildCampaignShareMessage } from "./CampaignShareButtons";

describe("CampaignShareButtons (#1172)", () => {
  const props = {
    campaignId: "campaign/42",
    campaignName: "Trees & clean water",
    description: "Plant 1,000 trees.",
    raisedAmount: "750",
    goalAmount: "1000",
    shareUrl: "https://fundable.example/campaigns/campaign%2F42",
  };

  it("builds an impact-oriented message by default", () => {
    expect(buildCampaignShareMessage(props)).toBe(
      "Support Trees & clean water! Plant 1,000 trees. 750/1000 raised.",
    );
  });

  it("prioritizes creator-customized share message when provided", () => {
    const customProps = {
      ...props,
      customShareMessage: "Join our eco-impact movement! Support clean water today.",
    };
    expect(buildCampaignShareMessage(customProps)).toBe(
      "Join our eco-impact movement! Support clean water today.",
    );
  });

  it("encodes provider-specific share parameters for Twitter, Facebook, WhatsApp, and LinkedIn", () => {
    const links = buildCampaignShareLinks(props);
    expect(links.canonicalUrl).toBe(props.shareUrl);
    expect(new URL(links.twitter).searchParams.get("text")).toContain("Trees & clean water");
    expect(new URL(links.twitter).searchParams.get("url")).toBe(props.shareUrl);
    expect(new URL(links.facebook).searchParams.get("quote")).toContain("750/1000 raised.");
    expect(new URL(links.whatsapp).searchParams.get("text")).toContain(props.shareUrl);
    expect(new URL(links.linkedin).searchParams.get("url")).toBe(props.shareUrl);
  });
});
