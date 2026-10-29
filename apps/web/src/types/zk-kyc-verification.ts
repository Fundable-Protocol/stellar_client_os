/**
 * Types for opt-in Zero-Knowledge KYC verification for high-value pledges (Issue #1345).
 *
 * Privacy-preserving: ZK proof credentials are verified without recording
 * name, passport number, or residence on-chain or in our database.
 * Only the wallet address and verification status are stored.
 */

/**
 * Supported ZK proof / credential providers.
 * Extendable as new protocols are integrated.
 */
export type ZkProofProvider = 'polygon_id' | 'reclaim_protocol' | 'zkpass' | 'self_protocol';

export type ZkKycStatus = 'unverified' | 'pending' | 'verified' | 'expired' | 'rejected';

export interface ZkKycRecord {
  /** Wallet address being verified (Stellar G-address). */
  walletAddress: string;
  /** KYC verification status. */
  status: ZkKycStatus;
  /** ZK credential provider used. */
  provider: ZkProofProvider;
  /**
   * Opaque proof identifier returned by the provider.
   * Used to check revocation status without storing PII.
   */
  proofId: string;
  /** ISO-8601 timestamp when the proof was issued. */
  verifiedAt: string | null;
  /** ISO-8601 timestamp when the proof expires. null = no expiry. */
  expiresAt: string | null;
  /** ISO-8601 timestamp of record creation. */
  createdAt: string;
  /** ISO-8601 timestamp of last status update. */
  updatedAt: string;
}

/** Campaign-level KYC threshold configuration set by the creator. */
export interface CampaignKycConfig {
  campaignId: string;
  /** Whether KYC is required at all for this campaign. */
  kycEnabled: boolean;
  /**
   * Pledge amount in XLM above which KYC is required.
   * Null means KYC is required for all pledges when kycEnabled=true.
   */
  kycThresholdXlm: number | null;
  /** Accepted proof providers. Empty = all supported providers accepted. */
  acceptedProviders: ZkProofProvider[];
  createdAt: string;
  updatedAt: string;
}

/** Input to submit a new ZK proof for a wallet. */
export interface SubmitZkProofInput {
  walletAddress: string;
  provider: ZkProofProvider;
  /** Raw proof token / credential JWT from the provider. */
  proofToken: string;
  /** Optional expiry ISO-8601 from the credential's claims. */
  expiresAt?: string | null;
}

/** Input to configure KYC for a campaign. */
export interface SetCampaignKycConfigInput {
  kycEnabled: boolean;
  kycThresholdXlm?: number | null;
  acceptedProviders?: ZkProofProvider[];
}

/** Shape returned when the pledge flow checks whether KYC is needed. */
export interface KycRequirementCheck {
  walletAddress: string;
  campaignId: string;
  pledgeAmountXlm: number;
  kycRequired: boolean;
  kycSatisfied: boolean;
  /** Guidance message for the backer UI. */
  message: string;
}
