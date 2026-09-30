/**
 * Fundable Stellar SDK - Carbon Credit Token Client
 *
 * Implements ERC-20 / SEP-41 carbon credit token allocation, minting status,
 * and sponsor credit calculations (1 token = 1 ton CO2 equivalent) (Issue #845).
 */

export interface CarbonCreditAllocation {
  campaignId: number;
  sponsor: string;
  contributionAmount: bigint;
  totalRaised: bigint;
  verifiedTrees: number;
  co2Multiplier: number;
  allocatedTokens: bigint;
}

export class CarbonCreditClient {
  constructor(
    public readonly contractAddress: string,
    public readonly rpcUrl?: string
  ) {}

  /**
   * Calculate sponsor's carbon credit allocation (1 token = 1 tonne CO2 eq).
   * Formula: (sponsorContribution / totalRaised) * (verifiedTrees * co2Multiplier).
   */
  static calculateAllocation(
    sponsorContribution: bigint,
    totalRaised: bigint,
    verifiedTrees: number,
    co2Multiplier: number = 1
  ): bigint {
    if (totalRaised <= BigInt(0) || sponsorContribution <= BigInt(0) || verifiedTrees <= 0) {
      return BigInt(0);
    }
    const mult = Math.max(1, co2Multiplier);
    const totalCredits = BigInt(verifiedTrees) * BigInt(mult);
    return (sponsorContribution * totalCredits) / totalRaised;
  }
}
