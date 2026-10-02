/**
 * Types for Campaign Completion Impact NFTs & Sponsor Personal Impact NFTs
 *
 * Requirements:
 * - When campaign completes, mint NFT showing campaign details, total trees, total CO2, sponsor count.
 * - Sponsors can mint personal impact NFTs.
 */

import { SponsorTier } from './sponsor';

export type ImpactNFTType = 'CAMPAIGN_COMPLETION' | 'PERSONAL_IMPACT';

export interface NFTAttribute {
  trait_type: string;
  value: string | number;
}

export interface BaseImpactNFT {
  tokenId: string;
  nftType: ImpactNFTType;
  campaignId: string;
  campaignTitle: string;
  issuedAt: string;
  txHash: string;
  metadataUri: string;
  verified: boolean;
  attributes: NFTAttribute[];
}

/**
 * Official Campaign Completion Impact NFT
 * Minted when a campaign completes, recording total trees, total CO2, sponsor count, and campaign details.
 */
export interface CampaignCompletionNFT extends BaseImpactNFT {
  nftType: 'CAMPAIGN_COMPLETION';
  creatorAddress: string;
  recipientAddress: string;
  fundingGoal: string;
  totalRaised: string;
  totalTrees: number;
  totalCo2Tonnes: number;
  sponsorCount: number;
  location?: string;
  species?: string;
  completedAt: string;
  metadata: {
    name: string;
    description: string;
    image: string;
    external_url: string;
    attributes: NFTAttribute[];
  };
}

/**
 * Sponsor Personal Impact NFT
 * Minted by a campaign sponsor to immortalize their individual contribution and environmental impact.
 */
export interface SponsorPersonalImpactNFT extends BaseImpactNFT {
  nftType: 'PERSONAL_IMPACT';
  sponsorAddress: string;
  sponsorContribution: string;
  contributionSharePercentage: number;
  personalTrees: number;
  personalCo2Tonnes: number;
  tier: SponsorTier;
  metadata: {
    name: string;
    description: string;
    image: string;
    external_url: string;
    attributes: NFTAttribute[];
  };
}

export type AnyImpactNFT = CampaignCompletionNFT | SponsorPersonalImpactNFT;

export interface MintCompletionNFTInput {
  campaignId: string;
  recipientAddress?: string;
  txHash?: string;
}

export interface MintPersonalImpactNFTInput {
  campaignId: string;
  sponsorAddress: string;
  txHash?: string;
}

export interface ImpactNFTVerificationResult {
  tokenId: string;
  isValid: boolean;
  nftType: ImpactNFTType;
  campaignId: string;
  txHash: string;
  verifiedAt: string;
  details: {
    trees: number;
    co2Tonnes: number;
    recipientOrSponsor: string;
  };
}
