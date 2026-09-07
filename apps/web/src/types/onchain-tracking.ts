/**
 * Types for On-Chain Campaign Tracking & NFT Certificates — Issue #785
 */

export interface OnChainMilestone {
  id: string;
  campaignId: string;
  milestonePercentage: number; // 25, 50, 75, 100
  title: string;
  description: string;
  targetAmount: string;
  achievedAmount: string;
  txHash: string;
  blockTimestamp: number;
  verifiedOnChain: boolean;
}

export interface NFTCertificate {
  certificateId: string;
  campaignId: string;
  campaignTitle: string;
  creatorAddress: string;
  recipientAddress?: string;
  fundingGoal: string;
  totalRaised: string;
  issuedAt: string;
  txHash: string;
  metadataUri: string;
  assetCode: string;
  verified: boolean;
}

export interface RecordMilestoneInput {
  campaignId: string;
  milestonePercentage: number;
  title: string;
  description: string;
  achievedAmount: string;
  targetAmount: string;
}

export interface MintCertificateInput {
  campaignId: string;
  campaignTitle: string;
  creatorAddress: string;
  fundingGoal: string;
  totalRaised: string;
  recipientAddress?: string;
}

export interface CertificateVerification {
  certificateId: string;
  isValid: boolean;
  onChainTxHash: string;
  verifiedAt: string;
  campaignDetails: {
    campaignId: string;
    campaignTitle: string;
    totalRaised: string;
  };
}
