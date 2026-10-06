/**
 * Campaign shapes used by the offline cache. They are intentionally
 * structural: the mobile screens can extend them, and the cache stays generic
 * over the exact detail payload returned by the API.
 */

export interface Sponsor {
  id: string;
  address: string;
  amount: string;
  token: string;
  sponsoredAt: number;
}

/** Lightweight campaign row shown in offline browse lists. */
export interface CampaignSummary {
  id: string;
  name: string;
  description?: string;
  status: string;
  goalAmount: string;
  raisedAmount: string;
  treeCount: number;
  sponsorCount: number;
  location?: string;
}

/** Full campaign payload cached for offline detail browsing. */
export interface CampaignDetail extends CampaignSummary {
  sponsors: Sponsor[];
  verificationProgress: number;
  treeSpeciesDiversity?: number;
  regionClimateImpact?: number;
  soilHealthImprovement?: number;
  biodiversityPotential?: number;
}

/** A persisted value together with the timestamp it was written. */
export interface CachedValue<T> {
  data: T;
  cachedAt: number;
}
