/**
 * Types for Creator Revenue Sharing — Issue #790
 */

export type CreatorTier = 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface TierFeeConfig {
  tier: CreatorTier;
  feePercentage: number; // Configurable between 5% and 15%
  minRaisedThreshold: number;
}

export interface RevenueShareSplit {
  totalAmount: number;
  platformFeePercentage: number;
  platformFeeAmount: number;
  creatorNetAmount: number;
  creatorTier: CreatorTier;
  currency: string;
}

export interface CalculateSplitInput {
  totalRaisedAmount: number;
  creatorTier?: CreatorTier;
  creatorAddress?: string;
  currency?: string;
}

export interface CreatorRevenueSummary {
  creatorAddress: string;
  tier: CreatorTier;
  feeRatePercentage: number;
  totalCampaignsFunded: number;
  totalGrossRaised: number;
  totalPlatformFeesPaid: number;
  totalNetEarnings: number;
}
