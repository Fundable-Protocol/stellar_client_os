import { describe, expect, it } from "vitest";
import {
  MILESTONE_PERCENTAGES,
  calculateFundingProgress,
  getAchievedMilestonePercentages,
  getNextMilestone,
  parseFundingAmount,
} from "./campaign-milestones";

describe("parseFundingAmount", () => {
  it("passes through finite numbers", () => {
    expect(parseFundingAmount(33850)).toBe(33850);
    expect(parseFundingAmount(0)).toBe(0);
  });

  it("handles non-finite numbers", () => {
    expect(parseFundingAmount(NaN)).toBe(0);
    expect(parseFundingAmount(Infinity)).toBe(0);
  });

  it("strips thousands separators", () => {
    expect(parseFundingAmount("33,850")).toBe(33850);
    expect(parseFundingAmount("50,000")).toBe(50000);
  });

  it("handles decimal amounts", () => {
    expect(parseFundingAmount("33,850.50")).toBeCloseTo(33850.5);
  });

  it("strips trailing token symbols", () => {
    expect(parseFundingAmount("33,850 XLM")).toBe(33850);
  });

  it("returns 0 for unparseable input", () => {
    expect(parseFundingAmount("")).toBe(0);
    expect(parseFundingAmount("abc")).toBe(0);
  });
});

describe("calculateFundingProgress", () => {
  it("computes a rounded percentage from string amounts", () => {
    expect(calculateFundingProgress("33,850", "50,000")).toBe(68);
    expect(calculateFundingProgress("12,500", "50,000")).toBe(25);
    expect(calculateFundingProgress("50,000", "50,000")).toBe(100);
  });

  it("caps progress at 100%", () => {
    expect(calculateFundingProgress("60,000", "50,000")).toBe(100);
  });

  it("never divides by zero or returns negatives", () => {
    expect(calculateFundingProgress("10,000", "0")).toBe(0);
    expect(calculateFundingProgress("10,000", "-5")).toBe(0);
    expect(calculateFundingProgress("10,000", "abc")).toBe(0);
  });
});

describe("getAchievedMilestonePercentages", () => {
  it("returns milestones whose threshold has been reached", () => {
    expect(getAchievedMilestonePercentages(0)).toEqual([]);
    expect(getAchievedMilestonePercentages(25)).toEqual([25]);
    expect(getAchievedMilestonePercentages(50)).toEqual([25, 50]);
    expect(getAchievedMilestonePercentages(67.7)).toEqual([25, 50]);
    expect(getAchievedMilestonePercentages(75)).toEqual([25, 50, 75]);
    expect(getAchievedMilestonePercentages(100)).toEqual([25, 50, 75, 100]);
  });

  it("clamps out-of-range progress", () => {
    expect(getAchievedMilestonePercentages(-10)).toEqual([]);
    expect(getAchievedMilestonePercentages(120)).toEqual([25, 50, 75, 100]);
  });

  it("exposes the canonical set of milestones", () => {
    expect(MILESTONE_PERCENTAGES).toEqual([25, 50, 75, 100]);
  });
});

describe("getNextMilestone", () => {
  it("returns the first unachieved milestone", () => {
    expect(getNextMilestone(0)).toBe(25);
    expect(getNextMilestone(30)).toBe(50);
    expect(getNextMilestone(80)).toBe(100);
  });

  it("returns null once fully funded", () => {
    expect(getNextMilestone(100)).toBeNull();
  });
});
