/**
 * Campaign IPFS Media Storage Types — Issue #1356
 *
 * Types for decentralized IPFS storage of campaign media assets (pitch decks,
 * whitepaper PDFs, and high-resolution demo videos), including CID pinning,
 * multi-gateway resolution, fallback CDN delivery, and on-chain verification.
 */

export type CampaignMediaAssetType =
  | "pitch_deck"
  | "video"
  | "whitepaper"
  | "document"
  | "teaser_video";

export interface CampaignMediaAsset {
  id: string;
  campaignId?: string;
  type: CampaignMediaAssetType;
  name: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Standard IPFS Content Identifier (CIDv0 or CIDv1). */
  cid: string;
  /** 32-byte SHA-256 hash formatted as 64 hex characters for on-chain Soroban anchoring. */
  onChainHashHex: string;
  /** Primary dedicated IPFS gateway streaming URL. */
  gatewayUrl: string;
  /** Ordered list of secondary fallback IPFS gateways for failover. */
  fallbackGateways: string[];
  /** High-speed fallback CDN URL for global delivery and edge caching. */
  cdnUrl: string;
  uploadedAt: number;
  pinned: boolean;
  pinProvider: "pinata" | "web3storage" | "ipfs-node";
  /** Whether the media asset's hash is anchored and verified on-chain. */
  onChainVerified: boolean;
  onChainTxHash?: string;
}

export interface MediaUploadOptions {
  campaignId?: string;
  name?: string;
  type?: CampaignMediaAssetType;
  provider?: "pinata" | "web3storage" | "ipfs-node" | "auto";
}

export interface MediaUploadResult {
  success: boolean;
  asset: CampaignMediaAsset;
}

export interface MediaVerificationResult {
  verified: boolean;
  cid: string;
  onChainHashHex: string;
  campaignId?: string;
  verifiedAt: number;
  message: string;
}

export interface IpfsGatewayResolution {
  primaryUrl: string;
  fallbackUrls: string[];
  cdnUrl: string;
}
