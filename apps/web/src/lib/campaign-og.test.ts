import { describe, expect, it } from "vitest";
import {
  campaignOgImageUrl,
  computeFundedPercent,
  formatDaysLeftLabel,
} from "./campaign-og";

describe("campaign OG helpers", () => {
  it("computes funded percent without floating-point drift", () => {
    expect(computeFundedPercent("250", "1000")).toBe(25);
    expect(computeFundedPercent("1000", "1000")).toBe(100);
    expect(computeFundedPercent("1500", "1000")).toBe(100);
  });

  it("formats days left from deadline", () => {
    const now = 1_000_000;
    expect(formatDaysLeftLabel(now + 3 * 24 * 60 * 60 * 1000, now)).toBe("3 days left");
    expect(formatDaysLeftLabel(now - 1, now)).toBe("Campaign ended");
  });

  it("builds absolute OG image URLs", () => {
    expect(campaignOgImageUrl("camp-1", "https://fundable.network")).toBe(
      "https://fundable.network/api/og/campaign/camp-1",
    );
  });
});
