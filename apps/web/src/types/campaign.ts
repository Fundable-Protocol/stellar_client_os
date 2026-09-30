/**
 * Campaign data models and filter types for the Stellar Client OS frontend.
 */

export type CampaignStatus = "Active" | "Paused" | "Successful" | "Failed" | "Claimed";

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
  uniqueContributors?: number;
  contributionCount?: number;
  sustainabilityScore?: CampaignSustainabilityScore;
}

export interface CampaignFilterOptions {
  searchQuery: string;
  status: CampaignStatus | "All";
  treeType: TreeType | "All";
  region: Region | "All";
  progressRange: "All" | "0-25%" | "25-50%" | "50-75%" | "75-100%" | "100%+";
  sortBy: "trending" | "newest" | "progress" | "target";
}
