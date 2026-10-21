/**
 * Types and interfaces for Stellar-native NFT Reward Tiers & Post-Campaign Airdrops
 *
 * Feature Request: Allow creators to offer Stellar-native NFTs as reward tier items,
 * automatically minted and airdropped to eligible backers after campaign close.
 *
 * Acceptance Criteria:
 * 1. Creator defines NFT reward tier and uploads asset
 * 2. NFT minted on Stellar on campaign close
 * 3. Backer receives NFT in their connected wallet
 */

export interface NFTRewardTierAsset {
  assetUrl: string; // HTTP(S), IPFS, or Base64 Data URL
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sha256?: string;
}

export interface NFTRewardTierItem {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  minimumPledge: string; // Minimum amount to qualify (token decimal units)
  token: string;
  asset: NFTRewardTierAsset;
  maxSupply?: number;
  claimedCount?: number;
  symbol?: string; // Stellar asset code / identifier
  mintOnClose: boolean;
  createdAt: number;
  updatedAt: number;
  /** Early bird pricing configuration (issue #1218) */
  earlyBirdPricing?: {
    discountPercent: number; // Percentage discount (e.g., 20 for 20% off)
    earlyBirdLimit: number; // First N backers
    claimedCount?: number; // Number of early bird slots claimed
  };
}

export interface DefineNFTRewardTierInput {
  id?: string;
  campaignId: string;
  name: string;
  description?: string;
  minimumPledge: string;
  token?: string;
  asset: NFTRewardTierAsset;
  maxSupply?: number;
  symbol?: string;
  mintOnClose?: boolean;
  /** Early bird pricing (issue #1218) */
  earlyBirdPricing?: {
    discountPercent: number;
    earlyBirdLimit: number;
  };
}

export interface BackerRewardEligibility {
  backerAddress: string;
  pledgedAmount: string;
  tierId: string;
  backedAt: number;
  txHash?: string;
}

export type NFTRewardDeliveryStatus = "PENDING" | "MINTED" | "DELIVERED" | "FAILED";

export interface NFTRewardAirdropRecord {
  id: string;
  campaignId: string;
  tierId: string;
  tierName: string;
  recipientAddress: string; // Backer's connected wallet address
  tokenId: string;
  assetCode: string;
  assetUrl: string;
  metadataUri: string;
  txHash: string;
  status: NFTRewardDeliveryStatus;
  mintedAt: string;
  deliveredAt?: string;
  error?: string;
}

export interface CampaignCloseAirdropResult {
  campaignId: string;
  campaignTitle: string;
  processedAt: string;
  totalTiers: number;
  totalEligibleBackers: number;
  totalAirdropped: number;
  airdrops: NFTRewardAirdropRecord[];
}
