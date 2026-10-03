/**
 * Campaign Insurance Service
 *
 * Manages campaign tree loss protection, pool balances, and automatic 2-year sponsor refund claims (Issue #851).
 */

export interface InsuranceStatusReport {
  campaignId: number;
  insuranceFundedAmount: bigint;
  coverageExpiresAt: Date;
  isCovered: boolean;
  daysRemaining: number;
}

export class CampaignInsuranceService {
  static readonly TWO_YEARS_MS = 63_072_000 * 1000;

  static getCoverageStatus(campaignId: number, grossRaised: bigint, createdAt: Date, now: Date = new Date()): InsuranceStatusReport {
    const insuranceFundedAmount = (grossRaised * BigInt(100)) / BigInt(10000);
    const expiresAtMs = createdAt.getTime() + this.TWO_YEARS_MS;
    const isCovered = now.getTime() <= expiresAtMs;
    const msRemaining = Math.max(0, expiresAtMs - now.getTime());
    const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));

    return {
      campaignId,
      insuranceFundedAmount,
      coverageExpiresAt: new Date(expiresAtMs),
      isCovered,
      daysRemaining,
    };
  }
}
