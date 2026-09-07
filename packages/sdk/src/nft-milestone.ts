export interface CampaignProgress {
  campaignId: string;
  targetAmount: bigint;
  currentAmount: bigint;
  nftAt50Minted: boolean;
  nftAtCompletionMinted: boolean;
}

export type NFTTier = '50_PERCENT' | 'COMPLETION';

/**
 * Determines which NFT tier (if any) is currently eligible to be minted 
 * based on the campaign's funding progress.
 */
export function getEligibleNFTTier(campaign: CampaignProgress): NFTTier | null {
  if (campaign.targetAmount === 0n) return null;

  // Calculate percentage using BigInt math
  const fundingPercentage = (campaign.currentAmount * 100n) / campaign.targetAmount;

  // Check 100% completion milestone first
  if (fundingPercentage >= 100n && !campaign.nftAtCompletionMinted) {
    return 'COMPLETION';
  }

  // Check 50% milestone
  if (fundingPercentage >= 50n && !campaign.nftAt50Minted) {
    return '50_PERCENT';
  }

  return null;
}
