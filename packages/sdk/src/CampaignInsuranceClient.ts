/**
 * Fundable Stellar SDK - Campaign Insurance Client
 *
 * Implements insurance pool protection (1% fee) and 2-year tree mortality refund handling (Issue #851).
 */

export interface InsurancePoolMetrics {
  tokenAddress: string;
  poolBalance: bigint;
  feeRateBps: number;
}

export interface PolicyCoverage {
  campaignId: number;
  coverageDurationSecs: number;
  isCovered: boolean;
  expiresAt: number;
}

export class CampaignInsuranceClient {
  static readonly TWO_YEARS_SECS = 63_072_000;
  static readonly DEFAULT_INSURANCE_FEE_BPS = 100; // 1%

  /**
   * Calculate insurance contribution from gross funds (1% by default).
   */
  static calculateInsuranceFee(grossAmount: bigint, feeBps: number = CampaignInsuranceClient.DEFAULT_INSURANCE_FEE_BPS): bigint {
    if (grossAmount <= BigInt(0)) return BigInt(0);
    return (grossAmount * BigInt(feeBps)) / BigInt(10_000);
  }

  /**
   * Determine if tree mortality claim is within the 2-year coverage window.
   */
  static isClaimValid(campaignCreatedAtSecs: number, claimTimestampSecs: number): boolean {
    return claimTimestampSecs <= campaignCreatedAtSecs + CampaignInsuranceClient.TWO_YEARS_SECS;
  }
}
