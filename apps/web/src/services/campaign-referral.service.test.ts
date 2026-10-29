import { afterEach, describe, expect, it } from "vitest";
import { campaignReferralService } from "./campaign-referral.service";

afterEach(() => campaignReferralService.reset());

describe("campaign referral service", () => {
  it("creates a stable short code per backer and campaign, with distinct codes for other pairs", () => {
    const first = campaignReferralService.createOrGetLink("campaign-a", "GBackerA", 100);
    const samePair = campaignReferralService.createOrGetLink("campaign-a", "gbackera", 200);
    const otherCampaign = campaignReferralService.createOrGetLink("campaign-b", "GBackerA", 100);
    const otherBacker = campaignReferralService.createOrGetLink("campaign-a", "GBackerB", 100);

    expect(first.code).toMatch(/^[A-Za-z0-9_-]{8}$/);
    expect(samePair.code).toBe(first.code);
    expect(samePair.createdAt).toBe(100);
    expect(new Set([first.code, otherCampaign.code, otherBacker.code]).size).toBe(3);
  });

  it("tracks unique clicks and confirmed pledges, excluding self-referrals and duplicate pledge events", () => {
    const link = campaignReferralService.createOrGetLink("campaign-a", "GReferrer");
    expect(campaignReferralService.recordClick(link.code)).toBe(true);
    expect(campaignReferralService.recordClick(link.code)).toBe(true);
    expect(campaignReferralService.recordClick("missing")).toBe(false);

    expect(campaignReferralService.recordConversion({ code: link.code, campaignId: "campaign-b", pledgeId: "p1", donorAddress: "GDonor", amount: "10", token: "XLM" })).toBe(false);
    expect(campaignReferralService.recordConversion({ code: link.code, campaignId: "campaign-a", pledgeId: "self", donorAddress: "greferrer", amount: "10", token: "XLM" })).toBe(false);
    expect(campaignReferralService.recordConversion({ code: link.code, campaignId: "campaign-a", pledgeId: "p1", donorAddress: "GDonor", amount: "10.25", token: "XLM" })).toBe(true);
    expect(campaignReferralService.recordConversion({ code: link.code, campaignId: "campaign-a", pledgeId: "p1", donorAddress: "GDonor", amount: "10.25", token: "XLM" })).toBe(false);
    expect(campaignReferralService.recordConversion({ code: link.code, campaignId: "campaign-a", pledgeId: "p2", donorAddress: "GOther", amount: "3", token: "USDC" })).toBe(true);

    expect(campaignReferralService.getStats(link.code, "GReferrer")).toEqual({
      clicks: 2,
      conversions: 2,
      amountRaisedByToken: { XLM: "10.25", USDC: "3" },
    });
    expect(campaignReferralService.getStats(link.code, "GOther")).toBeNull();
  });

  it("ranks referrers by attributed pledges and aggregates token totals separately", () => {
    const first = campaignReferralService.createOrGetLink("campaign-a", "GFirst");
    const second = campaignReferralService.createOrGetLink("campaign-a", "GSecond");
    campaignReferralService.recordConversion({ code: first.code, campaignId: "campaign-a", pledgeId: "p1", donorAddress: "GDonor1", amount: "2", token: "XLM" });
    campaignReferralService.recordConversion({ code: first.code, campaignId: "campaign-a", pledgeId: "p2", donorAddress: "GDonor2", amount: "3", token: "XLM" });
    campaignReferralService.recordConversion({ code: second.code, campaignId: "campaign-a", pledgeId: "p3", donorAddress: "GDonor3", amount: "7", token: "USDC" });

    expect(campaignReferralService.getCampaignLeaderboard("campaign-a")).toEqual([
      { backerAddress: "GFirst", clicks: 0, conversions: 2, amountRaisedByToken: { XLM: "5" } },
      { backerAddress: "GSecond", clicks: 0, conversions: 1, amountRaisedByToken: { USDC: "7" } },
    ]);
  });
});
