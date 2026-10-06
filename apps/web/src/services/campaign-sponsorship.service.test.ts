import { describe, expect, it } from "vitest";
import { calculateSponsorshipPricing, getSponsorshipTier } from "./campaign-sponsorship.service";

describe("campaign sponsorship tiers", () => {
  it.each([
    [1, "NONE", 0], [9, "NONE", 0], [10, "TREE_10", 500], [49, "TREE_10", 500],
    [50, "TREE_50", 1500], [99, "TREE_50", 1500], [100, "TREE_100", 2500], [1000, "TREE_100", 2500],
  ])("selects the correct tier at %i trees", (count, tier, bps) => {
    expect(getSponsorshipTier(count)).toEqual({ tier, discountRateBps: bps });
  });

  it("calculates exact gross, discount, and net amounts", () => {
    expect(calculateSponsorshipPricing("100.00", 100)).toMatchObject({
      tier: "TREE_100", discountPercent: 25, grossAmount: "100", discountAmount: "25", netAmount: "75",
    });
  });

  it("rejects invalid quantities and amounts", () => {
    expect(() => getSponsorshipTier(0)).toThrow();
    expect(() => getSponsorshipTier(1.5)).toThrow();
    expect(() => calculateSponsorshipPricing("0", 10)).toThrow();
  });
});
