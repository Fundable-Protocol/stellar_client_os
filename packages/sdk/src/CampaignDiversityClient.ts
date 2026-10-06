/**
 * Fundable Stellar SDK - Campaign Tree Species Diversity Client
 *
 * Implements diversity index tracking and environmental scoring (Issue #855).
 */

export interface SpeciesDistribution {
  speciesCode: string;
  count: number;
}

export interface CampaignDiversitySummary {
  campaignId: number;
  distinctSpeciesCount: number;
  totalTrees: number;
  diversityScoreBps: number;
  isCarbonCreditEligible: boolean;
  species: SpeciesDistribution[];
}

export class CampaignDiversityClient {
  constructor(
    public readonly contractAddress: string,
    public readonly rpcUrl?: string
  ) {}

  /**
   * Calculate diversity score from species distribution locally or simulate on-chain.
   * Higher diversity = higher score up to 10,000 bps.
   */
  static calculateScore(species: SpeciesDistribution[]): number {
    if (!species || species.length === 0) return 0;

    const distinct = species.length;
    const richnessBps = distinct >= 12 ? 5000 : Math.floor((distinct * 5000) / 12);

    const totalTrees = species.reduce((acc, s) => acc + s.count, 0);
    if (distinct <= 1 || totalTrees <= 1) {
      return richnessBps;
    }

    const sumSq = species.reduce((acc, s) => acc + s.count * s.count, 0);
    const maxSq = totalTrees * totalTrees;
    const concentration = Math.floor((sumSq * 5000) / maxSq);
    const evennessBps = Math.max(0, 5000 - concentration);

    return Math.min(10000, richnessBps + evennessBps);
  }

  /**
   * Checks whether campaign is eligible for premium carbon credit minting.
   */
  static isCarbonCreditEligible(scoreBps: number, totalTrees: number): boolean {
    return scoreBps >= 5000 && totalTrees >= 1000;
  }
}
