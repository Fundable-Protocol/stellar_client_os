/**
 * Fundable Stellar SDK - NFTRewardTierClient
 *
 * Implements utilities for Stellar-native NFT reward tier definition,
 * metadata generation, eligibility resolution, and automated mint & airdrop
 * post-campaign close.
 */

export interface NFTRewardAsset {
  assetUrl: string; // IPFS URI or HTTPS asset URL
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  sha256?: string;
}

export interface NFTRewardTierConfig {
  tierId: string;
  campaignId: string;
  tierName: string;
  description?: string;
  minimumPledge: string; // Amount in token units
  asset: NFTRewardAsset;
  maxSupply?: number; // Optional cap on NFT reward tier
  symbol?: string; // Asset code on Stellar (e.g., REWARD1)
  attributes?: Array<{
    trait_type: string;
    value: string | number;
  }>;
  /** Early bird pricing configuration (issue #1218) */
  earlyBirdPricing?: {
    discountPercent: number; // Percentage discount (e.g., 20 for 20% off)
    earlyBirdLimit: number; // First N backers
    claimedCount?: number; // Number of early bird slots claimed
  };
}

export interface NFTRewardMetadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties: {
    campaignId: string;
    tierId: string;
    recipientAddress: string;
    mintedAt: string;
    assetUrl: string;
    nftType: 'STELLAR_REWARD_TIER_NFT';
  };
}

export interface EligibleBacker {
  backerAddress: string;
  pledgedAmount: string; // Token units
  tierId: string;
  backedAt: number;
}

export interface AirdropResult {
  airdropId: string;
  tierId: string;
  campaignId: string;
  recipientAddress: string;
  tokenId: string;
  txHash: string;
  metadataUri: string;
  assetCode: string;
  mintedAt: string;
  status: 'DELIVERED' | 'FAILED';
  error?: string;
}

export class NFTRewardTierClient {
  constructor(
    public readonly contractAddress?: string,
    public readonly rpcUrl?: string
  ) {}

  /**
   * Validates an uploaded NFT reward asset.
   */
  static validateAsset(asset: NFTRewardAsset): { isValid: boolean; error?: string } {
    if (!asset || !asset.assetUrl || !asset.assetUrl.trim()) {
      return { isValid: false, error: 'Asset URL is required' };
    }

    const trimmed = asset.assetUrl.trim();
    const isUrl = /^https?:\/\//i.test(trimmed);
    const isIpfs = /^ipfs:\/\//i.test(trimmed) || trimmed.includes('/ipfs/');
    const isData = /^data:image\//i.test(trimmed);

    if (!isUrl && !isIpfs && !isData) {
      return { isValid: false, error: 'Asset URL must be a valid HTTPS URL, IPFS URI, or image data URI' };
    }

    return { isValid: true };
  }

  /**
   * Validates an NFT reward tier configuration.
   */
  static validateTierConfig(config: NFTRewardTierConfig): { isValid: boolean; error?: string } {
    if (!config.campaignId?.trim()) {
      return { isValid: false, error: 'campaignId is required' };
    }
    if (!config.tierId?.trim()) {
      return { isValid: false, error: 'tierId is required' };
    }
    if (!config.tierName?.trim()) {
      return { isValid: false, error: 'tierName is required' };
    }

    const pledge = parseFloat(config.minimumPledge);
    if (isNaN(pledge) || pledge <= 0) {
      return { isValid: false, error: 'minimumPledge must be a positive number' };
    }

    const assetValidation = this.validateAsset(config.asset);
    if (!assetValidation.isValid) {
      return assetValidation;
    }

    if (config.maxSupply !== undefined && (config.maxSupply <= 0 || !Number.isInteger(config.maxSupply))) {
      return { isValid: false, error: 'maxSupply must be a positive integer if provided' };
    }

    return { isValid: true };
  }

  /**
   * Formats SEP-standard / OpenSea NFT metadata for a reward tier NFT.
   */
  static formatRewardNFTMetadata(params: {
    config: NFTRewardTierConfig;
    campaignTitle: string;
    recipientAddress: string;
    mintedAt?: string;
  }): NFTRewardMetadata {
    const { config, campaignTitle, recipientAddress, mintedAt = new Date().toISOString() } = params;

    const attributes = [
      { trait_type: 'NFT Type', value: 'Stellar Reward Tier NFT' },
      { trait_type: 'Campaign ID', value: config.campaignId },
      { trait_type: 'Campaign Title', value: campaignTitle },
      { trait_type: 'Reward Tier', value: config.tierName },
      { trait_type: 'Minimum Pledge', value: config.minimumPledge },
      ...(config.attributes || []),
    ];

    return {
      name: `${campaignTitle} - ${config.tierName} NFT`,
      description: config.description || `Official Stellar-native reward NFT for supporting ${campaignTitle} at the ${config.tierName} tier.`,
      image: config.asset.assetUrl,
      external_url: `https://fundable.org/campaigns/${config.campaignId}`,
      attributes,
      properties: {
        campaignId: config.campaignId,
        tierId: config.tierId,
        recipientAddress,
        mintedAt,
        assetUrl: config.asset.assetUrl,
        nftType: 'STELLAR_REWARD_TIER_NFT',
      },
    };
  }

  /**
   * Filters backers who are eligible for an NFT reward tier based on minimum pledge and optional max supply cap.
   */
  static resolveEligibleBackers(
    backers: EligibleBacker[],
    tierConfig: NFTRewardTierConfig
  ): EligibleBacker[] {
    const minPledge = parseFloat(tierConfig.minimumPledge);
    const qualifying = backers.filter((b) => {
      // If backer specifically selected a tier, they must match tierId
      if (b.tierId && b.tierId.trim()) {
        return b.tierId === tierConfig.tierId;
      }
      // Otherwise (general backer / contribution), qualify if pledged >= minimumPledge
      const pledge = parseFloat(b.pledgedAmount);
      return !isNaN(pledge) && pledge >= minPledge;
    });

    // Sort by backing time ascending (FIFO) for limited supply
    qualifying.sort((a, b) => a.backedAt - b.backedAt);

    if (tierConfig.maxSupply && tierConfig.maxSupply > 0) {
      return qualifying.slice(0, tierConfig.maxSupply);
    }

    return qualifying;
  }

  /**
   * Simulates/executes Stellar NFT minting and airdrop distribution for eligible backers.
   */
  static async executeAirdrop(params: {
    tierConfig: NFTRewardTierConfig;
    campaignTitle: string;
    eligibleBackers: EligibleBacker[];
    txHashGenerator?: (recipient: string, index: number) => string;
  }): Promise<AirdropResult[]> {
    const { tierConfig, campaignTitle, eligibleBackers, txHashGenerator } = params;
    const results: AirdropResult[] = [];
    const now = new Date().toISOString();

    for (let i = 0; i < eligibleBackers.length; i++) {
      const backer = eligibleBackers[i];
      const tokenId = `NFT-REW-${tierConfig.campaignId.slice(0, 8)}-${tierConfig.tierId.slice(0, 8)}-${i + 1}`;
      const assetCode = tierConfig.symbol || `REW${tierConfig.campaignId.slice(0, 4).toUpperCase()}`;
      const txHash = txHashGenerator
        ? txHashGenerator(backer.backerAddress, i)
        : `0xairdrop_${tierConfig.tierId}_${backer.backerAddress.slice(0, 6)}_${Date.now().toString(16)}`;
      const metadata = this.formatRewardNFTMetadata({
        config: tierConfig,
        campaignTitle,
        recipientAddress: backer.backerAddress,
        mintedAt: now,
      });

      results.push({
        airdropId: `airdrop-${tierConfig.campaignId}-${tierConfig.tierId}-${i + 1}`,
        tierId: tierConfig.tierId,
        campaignId: tierConfig.campaignId,
        recipientAddress: backer.backerAddress,
        tokenId,
        txHash,
        metadataUri: `https://ipfs.io/ipfs/QmRewardNFT${tokenId.toLowerCase()}`,
        assetCode,
        mintedAt: now,
        status: 'DELIVERED',
      });
    }

    return results;
  }
}
