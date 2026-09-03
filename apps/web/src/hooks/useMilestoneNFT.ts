import { useState, useEffect } from 'react';
import { getEligibleNFTTier, CampaignProgress, NFTTier } from '@fundable/sdk';

export function useMilestoneNFT(campaign: CampaignProgress | null) {
  const [eligibleTier, setEligibleTier] = useState<NFTTier | null>(null);
  const [isMinting, setIsMinting] = useState(false);

  useEffect(() => {
    if (campaign) {
      const tier = getEligibleNFTTier(campaign);
      setEligibleTier(tier);
    }
  }, [campaign]);

  const mintNFT = async () => {
    if (!eligibleTier || !campaign) return;

    setIsMinting(true);
    try {
      console.log(`Preparing to mint ${eligibleTier} NFT for campaign ${campaign.campaignId}...`);
      
      // Simulating contract transaction delay
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      console.log(`Successfully minted the ${eligibleTier} commemorative NFT!`);
      setEligibleTier(null); 
    } catch (error) {
      console.error('Failed to mint milestone NFT:', error);
    } finally {
      setIsMinting(false);
    }
  };

  return {
    eligibleTier,
    isMinting,
    mintNFT
  };
}
