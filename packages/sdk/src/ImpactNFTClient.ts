/**
 * Fundable Stellar SDK - Impact NFT Client
 *
 * Implements utilities for Campaign Completion Impact NFTs and
 * Sponsor Personal Impact NFTs.
 */

export interface CampaignCompletionNFTMetadata {
  name: string;
  description: string;
  image?: string;
  external_url?: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties: {
    campaignId: string;
    campaignTitle: string;
    creatorAddress: string;
    totalTrees: number;
    totalCo2Tonnes: number;
    sponsorCount: number;
    totalRaised: string;
    fundingGoal: string;
    completedAt: string;
    nftType: 'CAMPAIGN_COMPLETION';
  };
}

export interface SponsorPersonalImpactNFTMetadata {
  name: string;
  description: string;
  image?: string;
  external_url?: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties: {
    campaignId: string;
    campaignTitle: string;
    sponsorAddress: string;
    sponsorContribution: string;
    contributionSharePercentage: number;
    personalTrees: number;
    personalCo2Tonnes: number;
    tier: string;
    nftType: 'PERSONAL_IMPACT';
  };
}

export interface PersonalImpactCalculation {
  contributionSharePercentage: number;
  personalTrees: number;
  personalCo2Tonnes: number;
}

export class ImpactNFTClient {
  constructor(
    public readonly contractAddress?: string,
    public readonly rpcUrl?: string
  ) {}

  /**
   * Calculates a sponsor's proportional personal impact (trees and CO2 sequestered).
   *
   * @param sponsorContribution - Amount contributed by sponsor in stroops or currency units.
   * @param totalRaised - Total amount raised by the campaign.
   * @param totalTrees - Total verified/planted trees in the campaign.
   * @param totalCo2Tonnes - Total CO2 sequestered in metric tonnes.
   */
  static calculatePersonalImpact(
    sponsorContribution: bigint,
    totalRaised: bigint,
    totalTrees: number,
    totalCo2Tonnes: number
  ): PersonalImpactCalculation {
    if (totalRaised <= 0n || sponsorContribution <= 0n) {
      return {
        contributionSharePercentage: 0,
        personalTrees: 0,
        personalCo2Tonnes: 0,
      };
    }

    // Share percentage calculated with 2 decimal precision using BigInt scaling (10000 basis points)
    const shareBps = Number((sponsorContribution * 10_000n) / totalRaised);
    const contributionSharePercentage = Math.min(100, Math.max(0, shareBps / 100));

    // Proportional trees: minimum 1 tree if contributed and trees exist
    let personalTrees = 0;
    if (totalTrees > 0) {
      const calculatedTrees = Math.round((Number(sponsorContribution) / Number(totalRaised)) * totalTrees);
      personalTrees = Math.max(1, calculatedTrees);
    }

    // Proportional CO2 in metric tonnes (rounded to 3 decimal places)
    let personalCo2Tonnes = 0;
    if (totalCo2Tonnes > 0) {
      const rawCo2 = (Number(sponsorContribution) / Number(totalRaised)) * totalCo2Tonnes;
      personalCo2Tonnes = Number(rawCo2.toFixed(3));
    }

    return {
      contributionSharePercentage,
      personalTrees,
      personalCo2Tonnes,
    };
  }

  /**
   * Formats OpenSea / ERC-721 / Stellar standard NFT metadata for a completed campaign.
   */
  static formatCompletionNFTMetadata(params: {
    campaignId: string;
    campaignTitle: string;
    creatorAddress: string;
    totalTrees: number;
    totalCo2Tonnes: number;
    sponsorCount: number;
    totalRaised: string;
    fundingGoal: string;
    completedAt: string;
    imageUri?: string;
  }): CampaignCompletionNFTMetadata {
    const {
      campaignId,
      campaignTitle,
      creatorAddress,
      totalTrees,
      totalCo2Tonnes,
      sponsorCount,
      totalRaised,
      fundingGoal,
      completedAt,
      imageUri = `https://fundable.org/api/nft/campaign/${campaignId}/image`,
    } = params;

    return {
      name: `${campaignTitle} - Official Completion Impact NFT`,
      description: `Official on-chain proof of completion for campaign "${campaignTitle}". This environmental initiative planted a verified total of ${totalTrees} trees, sequestering ${totalCo2Tonnes} metric tonnes of CO2 with the backing of ${sponsorCount} community sponsors.`,
      image: imageUri,
      external_url: `https://fundable.org/campaigns/${campaignId}`,
      attributes: [
        { trait_type: 'NFT Type', value: 'Campaign Completion Impact NFT' },
        { trait_type: 'Campaign Title', value: campaignTitle },
        { trait_type: 'Campaign ID', value: campaignId },
        { trait_type: 'Total Trees Planted', value: totalTrees },
        { trait_type: 'Total CO2 Sequestered (t)', value: totalCo2Tonnes },
        { trait_type: 'Total Sponsors', value: sponsorCount },
        { trait_type: 'Total Raised', value: totalRaised },
        { trait_type: 'Funding Goal', value: fundingGoal },
        { trait_type: 'Completion Date', value: completedAt },
      ],
      properties: {
        campaignId,
        campaignTitle,
        creatorAddress,
        totalTrees,
        totalCo2Tonnes,
        sponsorCount,
        totalRaised,
        fundingGoal,
        completedAt,
        nftType: 'CAMPAIGN_COMPLETION',
      },
    };
  }

  /**
   * Formats OpenSea / ERC-721 / Stellar standard NFT metadata for a sponsor's personal impact.
   */
  static formatPersonalImpactNFTMetadata(params: {
    campaignId: string;
    campaignTitle: string;
    sponsorAddress: string;
    sponsorContribution: string;
    contributionSharePercentage: number;
    personalTrees: number;
    personalCo2Tonnes: number;
    tier: string;
    imageUri?: string;
  }): SponsorPersonalImpactNFTMetadata {
    const {
      campaignId,
      campaignTitle,
      sponsorAddress,
      sponsorContribution,
      contributionSharePercentage,
      personalTrees,
      personalCo2Tonnes,
      tier,
      imageUri = `https://fundable.org/api/nft/sponsor/${campaignId}/${sponsorAddress}/image`,
    } = params;

    return {
      name: `${campaignTitle} - Personal Impact NFT`,
      description: `Personal on-chain environmental impact proof for sponsor ${sponsorAddress} in campaign "${campaignTitle}". Directly funded ${personalTrees} trees, sequestering an estimated ${personalCo2Tonnes} metric tonnes of CO2 (${contributionSharePercentage}% of total campaign funding).`,
      image: imageUri,
      external_url: `https://fundable.org/campaigns/${campaignId}`,
      attributes: [
        { trait_type: 'NFT Type', value: 'Personal Impact NFT' },
        { trait_type: 'Campaign Title', value: campaignTitle },
        { trait_type: 'Sponsor Address', value: sponsorAddress },
        { trait_type: 'Sponsor Tier', value: tier },
        { trait_type: 'Personal Trees Funded', value: personalTrees },
        { trait_type: 'Personal CO2 Offset (t)', value: personalCo2Tonnes },
        { trait_type: 'Contribution Amount', value: sponsorContribution },
        { trait_type: 'Funding Share (%)', value: contributionSharePercentage },
      ],
      properties: {
        campaignId,
        campaignTitle,
        sponsorAddress,
        sponsorContribution,
        contributionSharePercentage,
        personalTrees,
        personalCo2Tonnes,
        tier,
        nftType: 'PERSONAL_IMPACT',
      },
    };
  }
}
