/**
 * Types for the per-campaign sponsor Hall of Fame (#972).
 *
 * Ranked contributors show trees sponsored, estimated CO2 offset, and the
 * share of campaign funding that came from that sponsor.
 */

export const HALL_OF_FAME_LIMIT = 10;

export interface HallOfFameSponsor {
  rank: number;
  sponsorId: string;
  name?: string;
  address: string;
  avatarUrl?: string;
  amount: number;
  token: string;
  treesSponsored: number;
  co2OffsetKg: number;
  fundingSharePercent: number;
}

export interface HallOfFameBoard {
  campaignId: string;
  campaignTitle?: string;
  totalRaised: number;
  totalTrees: number;
  totalCo2OffsetKg: number;
  sponsorCount: number;
  sponsors: HallOfFameSponsor[];
}
