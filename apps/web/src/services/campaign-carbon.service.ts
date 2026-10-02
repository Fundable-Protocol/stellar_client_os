/**
 * Campaign Carbon Credit Service
 *
 * Provides web-tier token tracking, minting status verification,
 * and portfolio carbon credit balances (Issue #845).
 */

export interface SponsorCarbonPortfolio {
  campaignId: number;
  tokensMinted: bigint;
  tonnesCo2Offset: number;
  isMinted: boolean;
  canTrade: boolean;
}

export class CampaignCarbonService {
  /**
   * Summarizes carbon offset metrics for a sponsor contribution.
   */
  static getPortfolioSummary(
    campaignId: number,
    allocatedTokens: bigint,
    isMinted: boolean
  ): SponsorCarbonPortfolio {
    return {
      campaignId,
      tokensMinted: allocatedTokens,
      tonnesCo2Offset: Number(allocatedTokens), // 1 token = 1 tonne CO2
      isMinted,
      canTrade: isMinted && allocatedTokens > BigInt(0),
    };
  }
}
