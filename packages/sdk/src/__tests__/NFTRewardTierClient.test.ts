import { describe, it, expect } from 'vitest';
import { NFTRewardTierClient, NFTRewardTierConfig, EligibleBacker } from '../NFTRewardTierClient';

describe('NFTRewardTierClient', () => {
  const sampleTier: NFTRewardTierConfig = {
    tierId: 'tier-early-adopter',
    campaignId: 'camp-reforest-101',
    tierName: 'Early Adopter Guardian NFT',
    description: 'Exclusive commemorative NFT reward for early backers.',
    minimumPledge: '100.00',
    asset: {
      assetUrl: 'https://ipfs.io/ipfs/QmSampleAssetHash123456789/asset.png',
      fileName: 'guardian.png',
      fileSize: 1048576,
      mimeType: 'image/png',
    },
    maxSupply: 5,
    symbol: 'GUARD',
  };

  describe('validateAsset', () => {
    it('accepts valid https URL, ipfs URI, or data URI', () => {
      expect(NFTRewardTierClient.validateAsset({ assetUrl: 'https://example.com/asset.png' }).isValid).toBe(true);
      expect(NFTRewardTierClient.validateAsset({ assetUrl: 'ipfs://Qm12345/image.png' }).isValid).toBe(true);
      expect(NFTRewardTierClient.validateAsset({ assetUrl: 'data:image/png;base64,iVBORw0KGgo' }).isValid).toBe(true);
    });

    it('rejects empty or invalid asset URLs', () => {
      expect(NFTRewardTierClient.validateAsset({ assetUrl: '' }).isValid).toBe(false);
      expect(NFTRewardTierClient.validateAsset({ assetUrl: 'invalid-url' }).isValid).toBe(false);
    });
  });

  describe('validateTierConfig', () => {
    it('validates a complete tier config', () => {
      const res = NFTRewardTierClient.validateTierConfig(sampleTier);
      expect(res.isValid).toBe(true);
    });

    it('rejects invalid minimum pledge or missing fields', () => {
      expect(NFTRewardTierClient.validateTierConfig({ ...sampleTier, minimumPledge: '-5' }).isValid).toBe(false);
      expect(NFTRewardTierClient.validateTierConfig({ ...sampleTier, campaignId: '' }).isValid).toBe(false);
      expect(NFTRewardTierClient.validateTierConfig({ ...sampleTier, tierName: '' }).isValid).toBe(false);
      expect(NFTRewardTierClient.validateTierConfig({ ...sampleTier, maxSupply: -1 }).isValid).toBe(false);
    });
  });

  describe('formatRewardNFTMetadata', () => {
    it('formats metadata correctly matching Stellar and OpenSea standards', () => {
      const metadata = NFTRewardTierClient.formatRewardNFTMetadata({
        config: sampleTier,
        campaignTitle: 'Amazon Rainforest Reforestation',
        recipientAddress: 'GBACKER1234567890',
      });

      expect(metadata.name).toBe('Amazon Rainforest Reforestation - Early Adopter Guardian NFT NFT');
      expect(metadata.image).toBe(sampleTier.asset.assetUrl);
      expect(metadata.properties.campaignId).toBe(sampleTier.campaignId);
      expect(metadata.properties.tierId).toBe(sampleTier.tierId);
      expect(metadata.properties.recipientAddress).toBe('GBACKER1234567890');
      expect(metadata.properties.nftType).toBe('STELLAR_REWARD_TIER_NFT');

      const traits = metadata.attributes.reduce<Record<string, string | number>>((acc, attr) => {
        acc[attr.trait_type] = attr.value;
        return acc;
      }, {});

      expect(traits['Reward Tier']).toBe(sampleTier.tierName);
      expect(traits['Minimum Pledge']).toBe('100.00');
    });
  });

  describe('resolveEligibleBackers', () => {
    const backers: EligibleBacker[] = [
      { backerAddress: 'GBACKER1', pledgedAmount: '150.00', tierId: 'tier-early-adopter', backedAt: 1000 },
      { backerAddress: 'GBACKER2', pledgedAmount: '50.00', tierId: '', backedAt: 2000 },
      { backerAddress: 'GBACKER3', pledgedAmount: '200.00', tierId: '', backedAt: 3000 },
      { backerAddress: 'GBACKER4', pledgedAmount: '100.00', tierId: 'tier-early-adopter', backedAt: 4000 },
    ];

    it('resolves backers meeting pledge amount or tierId', () => {
      const eligible = NFTRewardTierClient.resolveEligibleBackers(backers, sampleTier);
      // GBACKER1 (tier-early-adopter, 150), GBACKER3 (200 >= 100), GBACKER4 (tier-early-adopter, 100)
      expect(eligible.length).toBe(3);
      expect(eligible.map((b) => b.backerAddress)).toEqual(['GBACKER1', 'GBACKER3', 'GBACKER4']);
    });

    it('respects maxSupply cap', () => {
      const cappedTier: NFTRewardTierConfig = { ...sampleTier, maxSupply: 2 };
      const eligible = NFTRewardTierClient.resolveEligibleBackers(backers, cappedTier);
      expect(eligible.length).toBe(2);
      expect(eligible.map((b) => b.backerAddress)).toEqual(['GBACKER1', 'GBACKER3']);
    });
  });

  describe('executeAirdrop', () => {
    it('executes automated airdrop creation for eligible backers', async () => {
      const backers: EligibleBacker[] = [
        { backerAddress: 'GBACKER1', pledgedAmount: '100.00', tierId: 'tier-early-adopter', backedAt: 1000 },
        { backerAddress: 'GBACKER2', pledgedAmount: '150.00', tierId: 'tier-early-adopter', backedAt: 2000 },
      ];

      const airdrops = await NFTRewardTierClient.executeAirdrop({
        tierConfig: sampleTier,
        campaignTitle: 'Amazon Rainforest Reforestation',
        eligibleBackers: backers,
      });

      expect(airdrops.length).toBe(2);
      expect(airdrops[0].status).toBe('DELIVERED');
      expect(airdrops[0].recipientAddress).toBe('GBACKER1');
      expect(airdrops[0].tokenId).toContain('NFT-REW');
      expect(airdrops[0].txHash).toBeDefined();
      expect(airdrops[1].recipientAddress).toBe('GBACKER2');
    });
  });
});
