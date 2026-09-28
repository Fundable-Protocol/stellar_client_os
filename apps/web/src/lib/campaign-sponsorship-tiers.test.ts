import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_SPONSORSHIP_TIERS,
  getCampaignSponsorshipTier,
  getCampaignSponsorshipTierForCount,
  getDiscountedSponsorshipAmount,
  recordCampaignSponsorshipImpact,
} from "./campaign-sponsorship-tiers";

describe("campaign sponsorship tiers", () => {
  it("defines the three requested bulk tiers", () => {
    expect(CAMPAIGN_SPONSORSHIP_TIERS.map(({ treeCount, discountBps }) => [treeCount, discountBps])).toEqual([
      [10, 500],
      [50, 1500],
      [100, 2500],
    ]);
  });

  it("calculates the discounted amount and safely handles invalid input", () => {
    const tier = getCampaignSponsorshipTier("growth")!;
    expect(getDiscountedSponsorshipAmount(100, tier)).toBe(85);
    expect(getDiscountedSponsorshipAmount(Number.NaN, tier)).toBe(0);
    expect(getDiscountedSponsorshipAmount(-1, tier)).toBe(0);
  });

  it("applies each bulk discount at its minimum quantity", () => {
    expect(getCampaignSponsorshipTierForCount(10).id).toBe("starter");
    expect(getCampaignSponsorshipTierForCount(49).id).toBe("starter");
    expect(getCampaignSponsorshipTierForCount(50).id).toBe("growth");
    expect(getCampaignSponsorshipTierForCount(99).id).toBe("growth");
    expect(getCampaignSponsorshipTierForCount(100).id).toBe("impact");
    expect(getCampaignSponsorshipTierForCount(150).id).toBe("impact");
  });

  it("appends tier choice and project selection to campaign impact history", () => {
    const entries = new Map<string, string>();
    const storage = {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => entries.set(key, value),
    };
    const record = {
      campaignId: "campaign-1",
      tierId: "impact" as const,
      treeCount: 100,
      discountBps: 2500,
      selectedTreeIds: ["tree-001"],
      recordedAt: 123,
    };

    recordCampaignSponsorshipImpact(storage, record);
    recordCampaignSponsorshipImpact(storage, { ...record, recordedAt: 456 });

    expect(JSON.parse(entries.get("campaign-sponsorship-impact:campaign-1")!)).toEqual([
      record,
      { ...record, recordedAt: 456 },
    ]);
  });
});
