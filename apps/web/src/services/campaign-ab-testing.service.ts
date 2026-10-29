import {
  ABTestConfig,
  ABTestVariant,
  CreateABTestDTO,
  SignificanceResult,
  TrafficSplit,
  WinnerSelectionMode,
} from "../types/campaign-ab-testing";

/**
 * Normal cumulative distribution function approximation (erf-based)
 */
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - p : p;
}

export class CampaignABTestingService {
  private tests: Map<string, ABTestConfig> = new Map();

  /**
   * Helper to generate a default 50/50 (or equal) traffic split for variants
   */
  public generateDefaultSplit(variantIds: string[]): TrafficSplit {
    if (variantIds.length === 0) return {};
    const equalShare = Math.floor(100 / variantIds.length);
    const remainder = 100 - equalShare * variantIds.length;

    const split: TrafficSplit = {};
    variantIds.forEach((id, index) => {
      split[id] = index === 0 ? equalShare + remainder : equalShare;
    });
    return split;
  }

  /**
   * Validate that traffic split percentages are non-negative and sum to 100
   */
  public validateTrafficSplit(split: TrafficSplit, variantIds: string[]): boolean {
    if (variantIds.length === 0) return false;
    let sum = 0;
    for (const id of variantIds) {
      const val = split[id];
      if (typeof val !== "number" || isNaN(val) || val < 0 || val > 100) {
        return false;
      }
      sum += val;
    }
    return Math.abs(sum - 100) < 0.01;
  }

  /**
   * Calculate conversion rate for a given variant
   */
  public getConversionRate(variant: ABTestVariant): number {
    if (!variant.impressions || variant.impressions <= 0) return 0;
    return variant.conversions / variant.impressions;
  }

  /**
   * Two-proportion z-test to determine statistical significance between two variants
   */
  public calculateSignificance(
    variantA: ABTestVariant,
    variantB: ABTestVariant,
    threshold: number = 0.95,
    minSampleSize: number = 100
  ): SignificanceResult {
    const n1 = variantA.impressions;
    const n2 = variantB.impressions;
    const x1 = variantA.conversions;
    const x2 = variantB.conversions;

    const sufficientData = n1 >= minSampleSize && n2 >= minSampleSize;

    if (n1 === 0 || n2 === 0) {
      return {
        pValue: 1,
        zScore: 0,
        confidence: 0,
        isSignificant: false,
        winnerVariantId: null,
        sufficientData: false,
        minSampleSizeRequired: minSampleSize,
        recommendation: `Collect at least ${minSampleSize} impressions on both variants to test significance.`,
      };
    }

    const p1 = x1 / n1;
    const p2 = x2 / n2;

    if (p1 === p2) {
      return {
        pValue: 1,
        zScore: 0,
        confidence: 0,
        isSignificant: false,
        winnerVariantId: null,
        sufficientData,
        minSampleSizeRequired: minSampleSize,
        recommendation: "Conversion rates are identical. Continue testing.",
      };
    }

    // Pooled proportion
    const pooled = (x1 + x2) / (n1 + n2);
    const standardError = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2));

    if (standardError === 0) {
      return {
        pValue: 1,
        zScore: 0,
        confidence: 0,
        isSignificant: false,
        winnerVariantId: null,
        sufficientData,
        minSampleSizeRequired: minSampleSize,
        recommendation: "Insufficient variance to calculate significance.",
      };
    }

    const zScore = (p1 - p2) / standardError;
    // Two-tailed p-value
    const pValue = 2 * (1 - normalCdf(Math.abs(zScore)));
    const confidence = Math.max(0, Math.min(1, 1 - pValue));
    const isSignificant = sufficientData && confidence >= threshold;

    let winnerVariantId: string | null = null;
    let recommendation = "";

    if (!sufficientData) {
      recommendation = `Sample size too small (${Math.min(n1, n2)}/${minSampleSize} per variant). Keep running test before drawing conclusions.`;
    } else if (isSignificant) {
      winnerVariantId = p1 > p2 ? variantA.id : variantB.id;
      const winnerName = p1 > p2 ? variantA.name : variantB.name;
      recommendation = `${winnerName} is the statistically significant winner with ${(confidence * 100).toFixed(1)}% confidence.`;
    } else {
      recommendation = `No statistically significant difference yet (${(confidence * 100).toFixed(1)}% confidence, ${(threshold * 100).toFixed(0)}% needed). Continue testing.`;
    }

    return {
      pValue,
      zScore,
      confidence,
      isSignificant,
      winnerVariantId,
      sufficientData,
      minSampleSizeRequired: minSampleSize,
      recommendation,
    };
  }

  /**
   * Create a new A/B test
   */
  public createTest(dto: CreateABTestDTO): ABTestConfig {
    const id = `ab-test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const variants: ABTestVariant[] = dto.variants.map((v, i) => ({
      id: `var-${i + 1}-${Math.random().toString(36).substring(2, 6)}`,
      name: v.name || (i === 0 ? "Variant A (Control)" : `Variant ${String.fromCharCode(65 + i)}`),
      headline: v.headline,
      heroImageUrl: v.heroImageUrl,
      ctaText: v.ctaText,
      impressions: 0,
      conversions: 0,
    }));

    const variantIds = variants.map((v) => v.id);
    const trafficSplit =
      dto.trafficSplit && this.validateTrafficSplit(dto.trafficSplit, variantIds)
        ? dto.trafficSplit
        : this.generateDefaultSplit(variantIds);

    const config: ABTestConfig = {
      id,
      campaignId: dto.campaignId,
      status: "active",
      variants,
      trafficSplit,
      winnerSelectionMode: dto.winnerSelectionMode || "manual",
      lockedWinnerId: null,
      significanceThreshold: dto.significanceThreshold ?? 0.95,
      minSampleSize: dto.minSampleSize ?? 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.tests.set(id, config);
    return config;
  }

  /**
   * Get an existing test by ID
   */
  public getTest(id: string): ABTestConfig | undefined {
    return this.tests.get(id);
  }

  /**
   * Get test for campaign
   */
  public getTestByCampaignId(campaignId: string): ABTestConfig | undefined {
    for (const test of this.tests.values()) {
      if (test.campaignId === campaignId) {
        return test;
      }
    }
    return undefined;
  }

  /**
   * Assign a variant for a visitor based on locked winner or traffic split
   */
  public routeTraffic(test: ABTestConfig, randomValue?: number): ABTestVariant {
    // If a winner is locked in, always route 100% of traffic to winner
    if (test.lockedWinnerId) {
      const winner = test.variants.find((v) => v.id === test.lockedWinnerId);
      if (winner) return winner;
    }

    if (test.variants.length === 0) {
      throw new Error("No variants available in A/B test");
    }

    if (test.variants.length === 1) {
      return test.variants[0];
    }

    const rand = (randomValue !== undefined ? randomValue : Math.random()) * 100;
    let accumulated = 0;

    for (const variant of test.variants) {
      const splitPercentage = test.trafficSplit[variant.id] ?? (100 / test.variants.length);
      accumulated += splitPercentage;
      if (rand <= accumulated) {
        return variant;
      }
    }

    return test.variants[test.variants.length - 1];
  }

  /**
   * Record an impression for a variant and evaluate auto-selection if configured
   */
  public recordImpression(testId: string, variantId: string): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) throw new Error(`Variant ${variantId} not found`);

    variant.impressions += 1;
    test.updatedAt = new Date().toISOString();

    if (test.winnerSelectionMode === "significance" && !test.lockedWinnerId) {
      this.evaluateAndApplyAutoWinner(test);
    }

    return test;
  }

  /**
   * Record a conversion for a variant and evaluate auto-selection if configured
   */
  public recordConversion(testId: string, variantId: string): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) throw new Error(`Variant ${variantId} not found`);

    variant.conversions += 1;
    test.updatedAt = new Date().toISOString();

    if (test.winnerSelectionMode === "significance" && !test.lockedWinnerId) {
      this.evaluateAndApplyAutoWinner(test);
    }

    return test;
  }

  /**
   * Update traffic split for a test
   */
  public updateTrafficSplit(testId: string, split: TrafficSplit): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    const variantIds = test.variants.map((v) => v.id);
    if (!this.validateTrafficSplit(split, variantIds)) {
      throw new Error("Invalid traffic split. Percentages must be >= 0 and sum to 100%.");
    }

    test.trafficSplit = { ...split };
    test.updatedAt = new Date().toISOString();
    return test;
  }

  /**
   * Update winner selection mode
   */
  public setWinnerSelectionMode(testId: string, mode: WinnerSelectionMode): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    test.winnerSelectionMode = mode;
    test.updatedAt = new Date().toISOString();

    if (mode === "significance" && !test.lockedWinnerId) {
      this.evaluateAndApplyAutoWinner(test);
    }

    return test;
  }

  /**
   * Manually lock in a winner variant
   */
  public lockWinner(testId: string, variantId: string): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    const variant = test.variants.find((v) => v.id === variantId);
    if (!variant) throw new Error(`Variant ${variantId} not found in test`);

    test.lockedWinnerId = variantId;
    test.status = "concluded";
    test.concludedAt = new Date().toISOString();
    test.updatedAt = new Date().toISOString();

    return test;
  }

  /**
   * Unlock winner (re-open A/B testing)
   */
  public unlockWinner(testId: string): ABTestConfig {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    test.lockedWinnerId = null;
    test.status = "active";
    delete test.concludedAt;
    test.updatedAt = new Date().toISOString();

    return test;
  }

  /**
   * Evaluate statistical significance between top two variants
   */
  public evaluateSignificance(testId: string): SignificanceResult {
    const test = this.tests.get(testId);
    if (!test) throw new Error(`A/B test ${testId} not found`);

    if (test.variants.length < 2) {
      return {
        pValue: 1,
        zScore: 0,
        confidence: 0,
        isSignificant: false,
        winnerVariantId: null,
        sufficientData: false,
        minSampleSizeRequired: test.minSampleSize,
        recommendation: "At least two variants are required to evaluate significance.",
      };
    }

    // Sort variants by conversion rate descending
    const sorted = [...test.variants].sort(
      (a, b) => this.getConversionRate(b) - this.getConversionRate(a)
    );

    return this.calculateSignificance(
      sorted[0],
      sorted[1],
      test.significanceThreshold,
      test.minSampleSize
    );
  }

  /**
   * Auto-lock winner if significance criteria met
   */
  private evaluateAndApplyAutoWinner(test: ABTestConfig): void {
    if (test.variants.length < 2) return;

    const result = this.evaluateSignificance(test.id);
    if (result.isSignificant && result.winnerVariantId) {
      test.lockedWinnerId = result.winnerVariantId;
      test.status = "concluded";
      test.concludedAt = new Date().toISOString();
    }
  }
}

export const campaignABTestingService = new CampaignABTestingService();
