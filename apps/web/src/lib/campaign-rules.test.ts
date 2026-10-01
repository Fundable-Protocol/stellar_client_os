import { describe, expect, it } from "vitest";
import {
  calculateCampaignCarbonCredits,
  calculateCampaignDemandPricing,
  getCampaignCreditMultiplierBps,
  getCampaignSeason,
} from "./campaign-rules";

describe("campaign demand pricing", () => {
  it("keeps baseline pricing below 70% funded", () => {
    expect(calculateCampaignDemandPricing({ baseCostPerTree: 100, targetAmount: 1_000, totalRaised: 699 }).adjustedCostPerTree).toBe(100n);
  });
  it("raises price at high demand and caps overfunding at the full tier", () => {
    const high = calculateCampaignDemandPricing({ baseCostPerTree: 100, targetAmount: 1_000, totalRaised: 900 });
    const overfunded = calculateCampaignDemandPricing({ baseCostPerTree: 100, targetAmount: 1_000, totalRaised: 2_000 });
    expect(high.adjustedCostPerTree).toBe(125n);
    expect(high.tier).toBe("high-demand");
    expect(overfunded.adjustedCostPerTree).toBe(150n);
    expect(overfunded.demandBps).toBe(10_000n);
  });
  it("avoids floating point precision loss for large amounts", () => {
    const result = calculateCampaignDemandPricing({
      baseCostPerTree: "1000000000000000000",
      targetAmount: "10000000000000000000",
      totalRaised: "9000000000000000000",
    });
    expect(result.adjustedCostPerTree).toBe(1_250_000_000_000_000_000n);
  });
});

describe("campaign seasonal credits", () => {
  it("uses 1.5x for Earth Month and Arbor Day", () => {
    expect(getCampaignSeason(new Date("2026-04-15T00:00:00Z"))).toBe("earth-month");
    expect(getCampaignSeason(new Date("2026-03-21T00:00:00Z"))).toBe("arbor-day");
    expect(getCampaignCreditMultiplierBps(new Date("2026-04-15T00:00:00Z"))).toBe(15_000);
    expect(calculateCampaignCarbonCredits(10, new Date("2026-03-21T00:00:00Z"))).toBe(15n);
  });
  it("uses 2x during rainy season and 1x otherwise", () => {
    expect(getCampaignCreditMultiplierBps(new Date("2026-06-01T00:00:00Z"))).toBe(20_000);
    expect(calculateCampaignCarbonCredits(10, new Date("2026-01-01T00:00:00Z"))).toBe(10n);
  });
});
