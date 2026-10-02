/**
 * Campaign Impact NFT Service
 *
 * Requirements:
 * - When campaign completes, mint NFT showing campaign details, total trees, total CO2, sponsor count.
 * - Sponsors can mint personal impact NFTs.
 */

import {
  CampaignCompletionNFT,
  SponsorPersonalImpactNFT,
  ImpactNFTVerificationResult,
  NFTAttribute,
} from '@/types/impact-nft';
import { calculateSponsorTier } from '@/types/sponsor';
import { getCampaign, getCampaignDataSource, CampaignRecord } from './campaign.service';
import { onChainCampaignTrackingService } from './onchain-campaign-tracking.service';

export class ImpactNFTError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'NOT_COMPLETED' | 'NOT_ELIGIBLE' | 'ALREADY_MINTED' | 'INVALID_INPUT'
  ) {
    super(message);
    this.name = 'ImpactNFTError';
  }
}

export class CampaignImpactNftService {
  private completionNFTs: Map<string, CampaignCompletionNFT> = new Map();
  // Key: `${campaignId}:${sponsorAddress.toLowerCase()}`
  private sponsorNFTs: Map<string, SponsorPersonalImpactNFT> = new Map();

  /**
   * Helper to derive CO2 in tonnes from a campaign record.
   */
  private computeCo2Tonnes(campaign: CampaignRecord, totalTrees: number): number {
    if (campaign.co2SequestrationKg) {
      const kg = parseFloat(campaign.co2SequestrationKg);
      if (!isNaN(kg) && kg > 0) {
        return Number((kg / 1000).toFixed(3));
      }
    }
    if (campaign.co2Sequestration) {
      const parsed = parseFloat(campaign.co2Sequestration);
      if (!isNaN(parsed) && parsed > 0) {
        return Number(parsed.toFixed(3));
      }
    }
    // Standard baseline: 20 kg CO2 / tree / year = 0.02 metric tonnes / tree
    return Number((totalTrees * 0.02).toFixed(3));
  }

  /**
   * Helper to verify if campaign is completed.
   */
  private isCampaignCompleted(campaign: CampaignRecord): boolean {
    const status = campaign.status as string;
    return status === 'COMPLETED' || status === 'Completed' || status === 'Successful' || status === 'Verified';
  }

  /**
   * Helper to resolve campaign from any data source.
   */
  private async resolveCampaign(campaignId: string, dataSource: any): Promise<CampaignRecord | null> {
    if (dataSource && typeof dataSource.getCampaign === 'function') {
      return (await dataSource.getCampaign(campaignId)) ?? null;
    }
    return await getCampaign(campaignId, dataSource);
  }

  /**
   * Mints an official Campaign Completion Impact NFT.
   * Records: campaign details, total trees, total CO2, sponsor count.
   */
  public async mintCampaignCompletionNFT(
    campaignId: string,
    options: {
      recipientAddress?: string;
      txHash?: string;
      dataSource?: any;
    } = {}
  ): Promise<CampaignCompletionNFT> {
    const existing = this.completionNFTs.get(campaignId);
    if (existing) {
      if (options.recipientAddress && options.recipientAddress !== existing.recipientAddress) {
        existing.recipientAddress = options.recipientAddress;
      }
      if (options.txHash && options.txHash !== existing.txHash) {
        existing.txHash = options.txHash;
      }
      return existing;
    }

    const dataSource = options.dataSource || getCampaignDataSource();
    const campaign = await this.resolveCampaign(campaignId, dataSource);
    if (!campaign) {
      throw new ImpactNFTError(`Campaign with ID "${campaignId}" not found`, 'NOT_FOUND');
    }

    if (!this.isCampaignCompleted(campaign)) {
      throw new ImpactNFTError(
        `Campaign "${campaign.name}" has status "${campaign.status}". It must be completed before minting a completion NFT.`,
        'NOT_COMPLETED'
      );
    }

    const totalTrees = campaign.treeCount ?? 0;
    const totalCo2Tonnes = this.computeCo2Tonnes(campaign, totalTrees);
    const sponsorCount = campaign.sponsorCount ?? campaign.sponsors?.length ?? 0;
    const now = new Date().toISOString();
    const tokenId = `NFT-COMPLETION-${campaign.id}-${Date.now()}`;
    const txHash = options.txHash || `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const recipientAddress = options.recipientAddress || campaign.creator;
    const metadataUri = `ipfs://bafybeifundablecompletion${campaign.id.toLowerCase()}${Date.now()}`;

    const attributes: NFTAttribute[] = [
      { trait_type: 'NFT Type', value: 'Campaign Completion Impact NFT' },
      { trait_type: 'Campaign Title', value: campaign.name },
      { trait_type: 'Campaign ID', value: campaign.id },
      { trait_type: 'Total Trees Planted', value: totalTrees },
      { trait_type: 'Total CO2 Sequestered (t)', value: totalCo2Tonnes },
      { trait_type: 'Total Sponsors', value: sponsorCount },
      { trait_type: 'Total Raised', value: campaign.raisedAmount },
      { trait_type: 'Funding Goal', value: campaign.goalAmount },
      { trait_type: 'Completion Status', value: campaign.status },
    ];

    if (campaign.location) {
      attributes.push({ trait_type: 'Planting Location', value: campaign.location });
    }
    if (campaign.treeSpecies || campaign.species) {
      attributes.push({ trait_type: 'Tree Species', value: campaign.treeSpecies || campaign.species || 'Mixed Native' });
    }

    const completionNFT: CampaignCompletionNFT = {
      tokenId,
      nftType: 'CAMPAIGN_COMPLETION',
      campaignId: campaign.id,
      campaignTitle: campaign.name,
      creatorAddress: campaign.creator,
      recipientAddress,
      fundingGoal: campaign.goalAmount,
      totalRaised: campaign.raisedAmount,
      totalTrees,
      totalCo2Tonnes,
      sponsorCount,
      location: campaign.location,
      species: campaign.treeSpecies || campaign.species,
      completedAt: new Date(campaign.statusChangedAt || Date.now()).toISOString(),
      issuedAt: now,
      txHash,
      metadataUri,
      verified: true,
      attributes,
      metadata: {
        name: `${campaign.name} - Official Completion Impact NFT`,
        description: `Official completion certificate and verified environmental impact for campaign "${campaign.name}". Planted ${totalTrees} trees sequestering ${totalCo2Tonnes} metric tonnes of CO2 with ${sponsorCount} sponsors.`,
        image: `https://fundable.org/api/nft/campaigns/${campaign.id}/badge.png`,
        external_url: `https://fundable.org/campaigns/${campaign.id}`,
        attributes,
      },
    };

    this.completionNFTs.set(campaign.id, completionNFT);

    // Also notify on-chain tracking service of completion
    try {
      await onChainCampaignTrackingService.recordOnChainMilestone({
        campaignId: campaign.id,
        milestonePercentage: 100,
        title: 'Campaign Completed',
        description: `Campaign "${campaign.name}" completed: ${totalTrees} trees planted, ${totalCo2Tonnes}t CO2 sequestered, ${sponsorCount} sponsors.`,
        achievedAmount: campaign.raisedAmount,
        targetAmount: campaign.goalAmount,
      });
    } catch {
      // Ignore background tracking failure
    }

    return completionNFT;
  }

  /**
   * Mints a Personal Impact NFT for a sponsor who supported the campaign.
   */
  public async mintSponsorPersonalImpactNFT(
    campaignId: string,
    sponsorAddress: string,
    options: {
      txHash?: string;
      dataSource?: any;
    } = {}
  ): Promise<SponsorPersonalImpactNFT> {
    if (!sponsorAddress || typeof sponsorAddress !== 'string' || !sponsorAddress.trim()) {
      throw new ImpactNFTError('A valid sponsorAddress is required to mint a personal impact NFT', 'INVALID_INPUT');
    }

    const trimmedAddress = sponsorAddress.trim();
    const key = `${campaignId}:${trimmedAddress.toLowerCase()}`;

    // Return existing if already minted
    const existing = this.sponsorNFTs.get(key);
    if (existing) {
      return existing;
    }

    const dataSource = options.dataSource || getCampaignDataSource();
    const campaign = await this.resolveCampaign(campaignId, dataSource);
    if (!campaign) {
      throw new ImpactNFTError(`Campaign with ID "${campaignId}" not found`, 'NOT_FOUND');
    }

    if (!this.isCampaignCompleted(campaign)) {
      throw new ImpactNFTError(
        `Campaign "${campaign.name}" has status "${campaign.status}". Personal impact NFTs can only be minted once the campaign completes.`,
        'NOT_COMPLETED'
      );
    }

    // Find sponsor's contributions
    const matchingSponsors = (campaign.sponsors || []).filter(
      (s) => s.address.toLowerCase() === trimmedAddress.toLowerCase()
    );

    let totalSponsorAmount = 0n;
    for (const s of matchingSponsors) {
      try {
        totalSponsorAmount += BigInt(s.amount);
      } catch {
        // Fallback for float amounts
        totalSponsorAmount += BigInt(Math.floor(parseFloat(s.amount) || 0));
      }
    }

    if (totalSponsorAmount <= 0n) {
      throw new ImpactNFTError(
        `Address "${trimmedAddress}" has no recorded contributions for campaign "${campaign.name}"`,
        'NOT_ELIGIBLE'
      );
    }

    const totalRaisedBigInt = BigInt(Math.max(1, parseInt(campaign.raisedAmount, 10) || 1));
    const totalTrees = campaign.treeCount ?? 0;
    const totalCo2Tonnes = this.computeCo2Tonnes(campaign, totalTrees);

    // Calculate sponsor's proportional share
    const shareBps = Number((totalSponsorAmount * 10_000n) / totalRaisedBigInt);
    const contributionSharePercentage = Math.min(100, Math.max(0.01, Number((shareBps / 100).toFixed(2))));

    // Proportional trees (at least 1 if campaign planted trees)
    let personalTrees = 0;
    if (totalTrees > 0) {
      personalTrees = Math.max(1, Math.round((Number(totalSponsorAmount) / Number(totalRaisedBigInt)) * totalTrees));
    }

    // Proportional CO2
    const personalCo2Tonnes = Number(
      ((Number(totalSponsorAmount) / Number(totalRaisedBigInt)) * totalCo2Tonnes).toFixed(3)
    );

    const tier = calculateSponsorTier(totalSponsorAmount.toString());
    const now = new Date().toISOString();
    const tokenId = `NFT-SPONSOR-${campaign.id}-${trimmedAddress.slice(-6)}-${Date.now()}`;
    const txHash = options.txHash || `0x${Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const metadataUri = `ipfs://bafybeipersonalimpact${campaign.id.toLowerCase()}${trimmedAddress.toLowerCase().slice(-6)}${Date.now()}`;

    const attributes: NFTAttribute[] = [
      { trait_type: 'NFT Type', value: 'Personal Impact NFT' },
      { trait_type: 'Campaign Title', value: campaign.name },
      { trait_type: 'Campaign ID', value: campaign.id },
      { trait_type: 'Sponsor Address', value: trimmedAddress },
      { trait_type: 'Sponsor Tier', value: tier },
      { trait_type: 'Personal Trees Funded', value: personalTrees },
      { trait_type: 'Personal CO2 Offset (t)', value: personalCo2Tonnes },
      { trait_type: 'Contribution Amount', value: totalSponsorAmount.toString() },
      { trait_type: 'Funding Share (%)', value: contributionSharePercentage },
    ];

    const personalNFT: SponsorPersonalImpactNFT = {
      tokenId,
      nftType: 'PERSONAL_IMPACT',
      campaignId: campaign.id,
      campaignTitle: campaign.name,
      sponsorAddress: trimmedAddress,
      sponsorContribution: totalSponsorAmount.toString(),
      contributionSharePercentage,
      personalTrees,
      personalCo2Tonnes,
      tier,
      issuedAt: now,
      txHash,
      metadataUri,
      verified: true,
      attributes,
      metadata: {
        name: `${campaign.name} - Personal Impact NFT (${trimmedAddress.slice(0, 6)}...${trimmedAddress.slice(-4)})`,
        description: `Verified personal environmental impact for sponsor ${trimmedAddress} in campaign "${campaign.name}". Funded ${personalTrees} trees sequestering ${personalCo2Tonnes} metric tonnes of CO2 (${contributionSharePercentage}% contribution share).`,
        image: `https://fundable.org/api/nft/campaigns/${campaign.id}/sponsors/${trimmedAddress}/badge.png`,
        external_url: `https://fundable.org/campaigns/${campaign.id}`,
        attributes,
      },
    };

    this.sponsorNFTs.set(key, personalNFT);
    return personalNFT;
  }

  /**
   * Retrieves the Campaign Completion Impact NFT if minted.
   */
  public async getCampaignCompletionNFT(campaignId: string): Promise<CampaignCompletionNFT | null> {
    return this.completionNFTs.get(campaignId) || null;
  }

  /**
   * Retrieves a sponsor's Personal Impact NFT for a campaign.
   */
  public async getSponsorPersonalImpactNFT(
    campaignId: string,
    sponsorAddress: string
  ): Promise<SponsorPersonalImpactNFT | null> {
    const key = `${campaignId}:${sponsorAddress.trim().toLowerCase()}`;
    return this.sponsorNFTs.get(key) || null;
  }

  /**
   * Retrieves all personal impact NFTs minted for a campaign.
   */
  public async getAllSponsorPersonalImpactNFTs(campaignId: string): Promise<SponsorPersonalImpactNFT[]> {
    return Array.from(this.sponsorNFTs.values()).filter((nft) => nft.campaignId === campaignId);
  }

  /**
   * Retrieves all personal impact NFTs owned by a sponsor across all campaigns.
   */
  public async getSponsorNFTs(sponsorAddress: string): Promise<SponsorPersonalImpactNFT[]> {
    const target = sponsorAddress.trim().toLowerCase();
    return Array.from(this.sponsorNFTs.values()).filter((nft) => nft.sponsorAddress.toLowerCase() === target);
  }

  /**
   * Verifies the authenticity and validity of any Impact NFT by its unique tokenId.
   */
  public async verifyImpactNFT(tokenId: string): Promise<ImpactNFTVerificationResult> {
    // Check completion NFTs
    for (const nft of this.completionNFTs.values()) {
      if (nft.tokenId === tokenId) {
        return {
          tokenId,
          isValid: true,
          nftType: 'CAMPAIGN_COMPLETION',
          campaignId: nft.campaignId,
          txHash: nft.txHash,
          verifiedAt: new Date().toISOString(),
          details: {
            trees: nft.totalTrees,
            co2Tonnes: nft.totalCo2Tonnes,
            recipientOrSponsor: nft.recipientAddress,
          },
        };
      }
    }

    // Check sponsor personal impact NFTs
    for (const nft of this.sponsorNFTs.values()) {
      if (nft.tokenId === tokenId) {
        return {
          tokenId,
          isValid: true,
          nftType: 'PERSONAL_IMPACT',
          campaignId: nft.campaignId,
          txHash: nft.txHash,
          verifiedAt: new Date().toISOString(),
          details: {
            trees: nft.personalTrees,
            co2Tonnes: nft.personalCo2Tonnes,
            recipientOrSponsor: nft.sponsorAddress,
          },
        };
      }
    }

    return {
      tokenId,
      isValid: false,
      nftType: 'CAMPAIGN_COMPLETION',
      campaignId: '',
      txHash: '',
      verifiedAt: new Date().toISOString(),
      details: {
        trees: 0,
        co2Tonnes: 0,
        recipientOrSponsor: '',
      },
    };
  }

  /**
   * Resets all in-memory minted NFTs (for unit test isolation).
   */
  public clearAll(): void {
    this.completionNFTs.clear();
    this.sponsorNFTs.clear();
  }
}

export const campaignImpactNftService = new CampaignImpactNftService();
