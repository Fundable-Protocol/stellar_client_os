import { describe, expect, it, afterEach } from "vitest";
import {
  getCampaignFeatureEntitlements,
  getSeasonalCarbonCreditIncentive,
} from "./campaign-rewards.service";

describe("campaign milestone rewards", () => {
  it("unlocks features cumulatively at 1k, 5k, and 10k trees", () => {
    expect(getCampaignFeatureEntitlements(999).every((item) => !item.unlocked)).toBe(true);
    expect(getCampaignFeatureEntitlements(1_000).map((item) => item.unlocked)).toEqual([true, false, false]);
    expect(getCampaignFeatureEntitlements(5_000).map((item) => item.unlocked)).toEqual([true, true, false]);
    expect(getCampaignFeatureEntitlements(10_000).map((item) => item.unlocked)).toEqual([true, true, true]);
  });
});

describe("seasonal carbon-credit incentives", () => {
  afterEach(() => { delete process.env.RAINY_SEASON_MONTHS; });
  it("applies 1.5x in Earth Month", () => {
    expect(getSeasonalCarbonCreditIncentive(Date.parse("2026-04-10T00:00:00Z"))).toEqual({ multiplier: 1.5, reason: "EARTH_MONTH_OR_ARBOR_DAY" });
  });
  it("applies 2x during the rainy season", () => {
    expect(getSeasonalCarbonCreditIncentive(Date.parse("2026-05-15T00:00:00Z"))).toEqual({ multiplier: 2, reason: "RAINY_SEASON" });
  });
  it("allows deployments to configure rainy-season months", () => {
    process.env.RAINY_SEASON_MONTHS = "11,12";
    expect(getSeasonalCarbonCreditIncentive(Date.parse("2026-11-01T00:00:00Z")).multiplier).toBe(2);
  });
});
