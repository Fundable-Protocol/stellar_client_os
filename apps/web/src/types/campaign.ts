/**
 * Campaign data models and filter types for the Stellar Client OS frontend.
 */

export type CampaignStatus = "Active" | "Paused" | "Successful" | "Failed" | "Claimed";

export type CampaignCategory =
  | "Tech"
  | "Art"
  | "Social Impact"
  | "Environment"
  | "Education"
  | "Health"
  | "Community"
  | "Other";

export const CAMPAIGN_CATEGORIES: readonly CampaignCategory[] = [
  "Tech",
  "Art",
  "Social Impact",
  "Environment",
  "Education",
  "Health",
  "Community",
  "Other",
] as const;

export const MAX_CAMPAIGN_TAGS = 10;

export type TreeType =
  | "Oak"
  | "Mangrove"
  | "Pine"
  | "Acacia"
  | "Cedar"
  | "Fruit Tree"
  | "Baobab"
  | "Redwood"
  | "Birch"
  | "General Fund";

export type Region = 
  | "North America"
  | "South America"
  | "Europe"
  | "Africa"
  | "Asia"
  | "Oceania"
  | "Global";

export interface SustainabilityPillarScore {
  score: number;
  maxScore: number;
  percentage: number;
  grade: "Optimal" | "High" | "Moderate" | "Developing";
  title: string;
  rationale: string;
  highlights: string[];
}

export type SustainabilityTier = "Optimal" | "High Impact" | "Moderate" | "Developing";

export interface CampaignSustainabilityScore {
  totalScore: number;
  tier: SustainabilityTier;
  tierDescription: string;
  pillars: {
    speciesDiversity: SustainabilityPillarScore;
    climateImpact: SustainabilityPillarScore;
    soilHealth: SustainabilityPillarScore;
    biodiversityPotential: SustainabilityPillarScore;
  };
  recommendations: string[];
}

export interface CampaignCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Creator-defined impact metric for socially-focused campaigns.
 * The formula is expressed in terms of `amount_raised` and `cost_per_unit`,
 * e.g. "amount_raised / cost_per_unit".
 */
export interface ImpactMetricDefinition {
  name: string;
  unit: string;
  formula: string;
  costPerUnit: number;
}

export type DisputeStatus =
  | "open"
  | "creator_responded"
  | "under_review"
  | "resolved"
  | "rejected";

export type DisputeReason = "undelivered_reward" | "fraud" | "other";

export interface DisputeEvidence {
  id: string;
  url: string;
  description?: string;
  uploadedAt: number;
}

export interface CampaignDispute {
  id: string;
  campaignId: string;
  backerAddress: string;
  reason: DisputeReason;
  description: string;
  evidence: DisputeEvidence[];
  filedAt: number;
  /** filedAt + 7 days */
  creatorResponseDeadline: number;
  creatorResponse?: string;
  mediatorDecision?: string;
  refundAmount?: string;
  refundType?: "partial" | "full";
  resolvedAt?: number;
  status: DisputeStatus;
}

export interface FileDisputeInput {
  campaignId: string;
  backerAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: DisputeEvidence[];
}

export interface RespondToDisputeInput {
  disputeId: string;
  creatorResponse: string;
}

export interface ResolveDisputeInput {
  disputeId: string;
  mediatorDecision: string;
  refundType: "partial" | "full";
  refundAmount: string;
}

export interface CampaignData {
  id: string;
  title: string;
  description: string;
  creator: string;
  token: string;
  targetAmount: string;
  minTarget: string;
  totalRaised: string;
  status: CampaignStatus;
  treeType: TreeType;
  costPerTree: number;
  treesPlanted: number;
  targetTrees: number;
  createdAt: number;
  deadline: number;
  location?: string;
  region?: Region;
  imageUrl?: string;
  sponsorCount?: number;
  uniqueContributors?: number;
  contributionCount?: number;
  sustainabilityScore?: CampaignSustainabilityScore;
  impactMetric?: ImpactMetricDefinition;
  isStaffPick?: boolean;
  staffPickReason?: string;
  category?: CampaignCategory;
  tags?: string[];
}

export interface CampaignFilterOptions {
  searchQuery: string;
  status: CampaignStatus | "All";
  treeType: TreeType | "All";
  region: Region | "All";
  progressRange: "All" | "0-25%" | "25-50%" | "50-75%" | "75-100%" | "100%+";
  sortBy: "trending" | "newest" | "progress" | "target";
  /** Selected categories; an empty array means "All". */
  categories: CampaignCategory[];
  /** Selected tags; an empty array means "All". */
  tags: string[];
}
