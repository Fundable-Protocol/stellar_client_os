import { describe, expect, it } from "vitest";
import { resolveCampaignFundingTier } from "./campaign-rate-limit";

describe("campaign funding API tiers", () => {
  it("assigns basic up to the basic threshold", () => {
    expect(resolveCampaignFundingTier("9999")).toMatchObject({ tier: "basic", requestsPerHour: 100 });
  });
  it("assigns pro between basic and enterprise thresholds", () => {
    expect(resolveCampaignFundingTier("10000")).toMatchObject({ tier: "pro", requestsPerHour: 1_000 });
    expect(resolveCampaignFundingTier("99999")).toMatchObject({ tier: "pro", requestsPerHour: 1_000 });
  });
  it("assigns enterprise at or above the enterprise threshold", () => {
    expect(resolveCampaignFundingTier("100000")).toMatchObject({ tier: "enterprise", requestsPerHour: 10_000 });
  });
  it("handles malformed goals conservatively as basic", () => {
    expect(resolveCampaignFundingTier("not-a-number").tier).toBe("basic");
  });
});
