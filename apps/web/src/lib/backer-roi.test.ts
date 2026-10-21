import { describe, expect, it } from "vitest";
import {
  calculateBackerRoi,
  getPledgeSliderRange,
  validateInvestmentTerms,
  type CampaignInvestmentTerms,
} from "./backer-roi";

const terms: CampaignInvestmentTerms = {
  model: "revenue_share",
  revenueSharePercent: 10,
  projectedAnnualRevenue: 200_000,
  fundingGoal: 50_000,
  termYears: 5,
  annualGrowthPercent: 0,
  currency: "USDC",
};

describe("calculateBackerRoi", () => {
  it("pays a pro-rata share of the backer revenue pool", () => {
    // 1,000 / 50,000 = 2% of a pool that is 10% of 200,000 = 20,000/yr → 400/yr.
    const projection = calculateBackerRoi(terms, 1_000);
    expect(projection.poolShare).toBeCloseTo(0.02);
    expect(projection.firstYearPayout).toBe(400);
    expect(projection.totalReturn).toBe(2_000);
    expect(projection.netProfit).toBe(1_000);
    expect(projection.roiPercent).toBe(100);
    expect(projection.returnMultiple).toBe(2);
    expect(projection.paybackYear).toBe(3);
    expect(projection.years).toHaveLength(5);
    expect(projection.years[4].cumulativePayout).toBe(2_000);
  });

  it("compounds revenue growth year over year", () => {
    const projection = calculateBackerRoi({ ...terms, annualGrowthPercent: 10, termYears: 3 }, 1_000);
    expect(projection.years.map((y) => y.payout)).toEqual([400, 440, 484]);
    expect(projection.totalReturn).toBe(1_324);
  });

  it("reports a loss and no payback when returns do not cover the pledge", () => {
    const projection = calculateBackerRoi({ ...terms, projectedAnnualRevenue: 10_000 }, 1_000);
    expect(projection.totalReturn).toBe(100);
    expect(projection.netProfit).toBe(-900);
    expect(projection.roiPercent).toBe(-90);
    expect(projection.paybackYear).toBeNull();
  });

  it("caps the pool share at 100% and handles zero or invalid pledges", () => {
    expect(calculateBackerRoi(terms, 80_000).poolShare).toBe(1);
    const zero = calculateBackerRoi(terms, 0);
    expect(zero).toMatchObject({ totalReturn: 0, roiPercent: 0, returnMultiple: 0, paybackYear: null });
    expect(calculateBackerRoi(terms, Number.NaN).pledgeAmount).toBe(0);
  });
});

describe("validateInvestmentTerms", () => {
  it("accepts numeric strings from form inputs and applies defaults", () => {
    const result = validateInvestmentTerms({
      revenueSharePercent: "12.5",
      projectedAnnualRevenue: "150000",
      fundingGoal: "40000",
      termYears: "4",
      currency: "xlm",
    });
    expect(result).toEqual({
      ok: true,
      value: {
        model: "revenue_share",
        revenueSharePercent: 12.5,
        projectedAnnualRevenue: 150_000,
        fundingGoal: 40_000,
        termYears: 4,
        annualGrowthPercent: 0,
        currency: "XLM",
      },
    });
  });

  it("rejects out-of-range values", () => {
    const result = validateInvestmentTerms({
      model: "loan",
      revenueSharePercent: 0,
      projectedAnnualRevenue: -1,
      fundingGoal: "abc",
      termYears: 2.5,
      annualGrowthPercent: -100,
      minPledge: 500,
      maxPledge: 100,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(
        ["annualGrowthPercent", "fundingGoal", "maxPledge", "model", "projectedAnnualRevenue", "revenueSharePercent", "termYears"].sort(),
      );
    }
  });
});

describe("getPledgeSliderRange", () => {
  it("uses creator pledge limits when set, otherwise 1 → funding goal", () => {
    expect(getPledgeSliderRange(terms)).toMatchObject({ min: 1, max: 50_000 });
    expect(getPledgeSliderRange({ ...terms, minPledge: 100, maxPledge: 5_000 })).toMatchObject({ min: 100, max: 5_000 });
  });
});
