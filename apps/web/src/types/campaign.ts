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
  | "Birch";

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
  imageUrl?: string;
  uniqueContributors?: number;
  contributionCount?: number;
}

export interface CampaignFilterOptions {
  searchQuery: string;
  status: CampaignStatus | "All";
  treeType: TreeType | "All";
  progressRange: "All" | "0-25%" | "25-50%" | "50-75%" | "75-100%" | "100%+";
  sortBy: "trending" | "newest" | "progress" | "target";
}
