import { describe, it, expect, beforeEach } from 'vitest';
import {
  CampaignImpactNftService,
  ImpactNFTError,
} from './campaign-impact-nft.service';
import type { CampaignRecord } from './campaign.service';

describe('CampaignImpactNftService', () => {
  let service: CampaignImpactNftService;

  const mockCompletedCampaign: CampaignRecord = {
    id: 'camp-test-1',
    creator: 'GCREATOR1234567890ABCDEF',
    name: 'Mangrove Reforestation Project',
    description: 'Restoring coastal mangrove ecosystems for biodiversity and storm protection.',
    location: 'Madagascar Coastal Belt',
    species: 'Rhizophora mucronata',
    treeSpecies: 'Rhizophora mucronata',
    status: 'COMPLETED',
    goalAmount: '10000',
    raisedAmount: '12000',
    treeCount: 600,
    co2SequestrationKg: '12000', // 12 metric tonnes
    sponsorCount: 3,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now(),
    statusChangedAt: Date.now(),
    statusHistory: [],
    sponsors: [
      {
        id: 'sp-1',
        campaignId: 'camp-test-1',
        address: 'GSPONSOR_ALICE_111111111111',
        amount: '6000', // 50%
        token: 'USDC',
        sponsoredAt: Date.now() - 50000,
      },
      {
        id: 'sp-2',
        campaignId: 'camp-test-1',
        address: 'GSPONSOR_BOB_22222222222222',
        amount: '3600', // 30%
        token: 'USDC',
        sponsoredAt: Date.now() - 40000,
      },
      {
        id: 'sp-3',
        campaignId: 'camp-test-1',
        address: 'GSPONSOR_CHARLIE_333333333333',
        amount: '2400', // 20%
        token: 'USDC',
        sponsoredAt: Date.now() - 30000,
      },
    ],
  };

  const mockActiveCampaign: CampaignRecord = {
    ...mockCompletedCampaign,
    id: 'camp-test-active',
    status: 'ACTIVE',
  };

  const mockDataSource = {
    getCampaign: async (id: string) => {
      if (id === mockCompletedCampaign.id) return mockCompletedCampaign;
      if (id === mockActiveCampaign.id) return mockActiveCampaign;
      return null;
    },
    getCampaigns: async () => [mockCompletedCampaign, mockActiveCampaign],
    saveCampaign: async (c: CampaignRecord) => c,
  };

  beforeEach(() => {
    service = new CampaignImpactNftService();
  });

  describe('mintCampaignCompletionNFT', () => {
    it('mints completion NFT showing campaign details, total trees, total CO2, sponsor count', async () => {
      const nft = await service.mintCampaignCompletionNFT(mockCompletedCampaign.id, {
        dataSource: mockDataSource,
      });

      expect(nft).toBeDefined();
      expect(nft.nftType).toBe('CAMPAIGN_COMPLETION');
      expect(nft.campaignId).toBe(mockCompletedCampaign.id);
      expect(nft.campaignTitle).toBe('Mangrove Reforestation Project');
      expect(nft.creatorAddress).toBe(mockCompletedCampaign.creator);
      expect(nft.fundingGoal).toBe('10000');
      expect(nft.totalRaised).toBe('12000');
      expect(nft.totalTrees).toBe(600);
      expect(nft.totalCo2Tonnes).toBe(12); // 12,000 kg = 12 tonnes
      expect(nft.sponsorCount).toBe(3);
      expect(nft.verified).toBe(true);
      expect(nft.tokenId).toContain(`NFT-COMPLETION-${mockCompletedCampaign.id}`);
      expect(nft.metadataUri).toContain('ipfs://');

      // Check metadata attributes
      const attributes = nft.attributes.reduce<Record<string, string | number>>((acc, attr) => {
        acc[attr.trait_type] = attr.value;
        return acc;
      }, {});

      expect(attributes['Total Trees Planted']).toBe(600);
      expect(attributes['Total CO2 Sequestered (t)']).toBe(12);
      expect(attributes['Total Sponsors']).toBe(3);
      expect(attributes['Campaign Title']).toBe('Mangrove Reforestation Project');
      expect(attributes['Planting Location']).toBe('Madagascar Coastal Belt');
    });

    it('rejects minting if campaign is not completed', async () => {
      await expect(
        service.mintCampaignCompletionNFT(mockActiveCampaign.id, {
          dataSource: mockDataSource,
        })
      ).rejects.toThrow(ImpactNFTError);

      await expect(
        service.mintCampaignCompletionNFT(mockActiveCampaign.id, {
          dataSource: mockDataSource,
        })
      ).rejects.toThrow(/must be completed/);
    });

    it('throws NOT_FOUND error for non-existent campaign', async () => {
      await expect(
        service.mintCampaignCompletionNFT('non-existent-id', {
          dataSource: mockDataSource,
        })
      ).rejects.toThrow(/not found/);
    });

    it('is idempotent: returns the existing completion NFT on duplicate calls', async () => {
      const first = await service.mintCampaignCompletionNFT(mockCompletedCampaign.id, {
        dataSource: mockDataSource,
      });
      const second = await service.mintCampaignCompletionNFT(mockCompletedCampaign.id, {
        dataSource: mockDataSource,
      });

      expect(first.tokenId).toBe(second.tokenId);
      expect(first.txHash).toBe(second.txHash);
    });
  });

  describe('mintSponsorPersonalImpactNFT', () => {
    it('allows sponsors to mint personal impact NFTs with proportional trees and CO2', async () => {
      // Alice contributed 6,000 out of 12,000 (50%)
      const aliceNft = await service.mintSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_ALICE_111111111111',
        { dataSource: mockDataSource }
      );

      expect(aliceNft).toBeDefined();
      expect(aliceNft.nftType).toBe('PERSONAL_IMPACT');
      expect(aliceNft.campaignId).toBe(mockCompletedCampaign.id);
      expect(aliceNft.sponsorAddress).toBe('GSPONSOR_ALICE_111111111111');
      expect(aliceNft.sponsorContribution).toBe('6000');
      expect(aliceNft.contributionSharePercentage).toBe(50);
      expect(aliceNft.personalTrees).toBe(300); // 50% of 600
      expect(aliceNft.personalCo2Tonnes).toBe(6); // 50% of 12 tonnes
      expect(aliceNft.tier).toBe('GOLD'); // 6,000 USDC qualifies for GOLD

      const traits = aliceNft.attributes.reduce<Record<string, string | number>>((acc, attr) => {
        acc[attr.trait_type] = attr.value;
        return acc;
      }, {});

      expect(traits['Personal Trees Funded']).toBe(300);
      expect(traits['Personal CO2 Offset (t)']).toBe(6);
      expect(traits['Sponsor Tier']).toBe('GOLD');
      expect(traits['Funding Share (%)']).toBe(50);
    });

    it('calculates impact correctly for other sponsors with different amounts', async () => {
      // Bob contributed 3,600 out of 12,000 (30%)
      const bobNft = await service.mintSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_BOB_22222222222222',
        { dataSource: mockDataSource }
      );

      expect(bobNft.contributionSharePercentage).toBe(30);
      expect(bobNft.personalTrees).toBe(180); // 30% of 600
      expect(bobNft.personalCo2Tonnes).toBe(3.6); // 30% of 12
      expect(bobNft.tier).toBe('GOLD');
    });

    it('rejects an address that is not a sponsor of the campaign', async () => {
      await expect(
        service.mintSponsorPersonalImpactNFT(
          mockCompletedCampaign.id,
          'GNOT_A_SPONSOR_999999999999',
          { dataSource: mockDataSource }
        )
      ).rejects.toThrow(/no recorded contributions/);
    });

    it('rejects minting personal impact NFT if campaign is not completed', async () => {
      await expect(
        service.mintSponsorPersonalImpactNFT(
          mockActiveCampaign.id,
          'GSPONSOR_ALICE_111111111111',
          { dataSource: mockDataSource }
        )
      ).rejects.toThrow(/only be minted once the campaign completes/);
    });

    it('is idempotent for sponsors: returns existing NFT on subsequent mint attempts', async () => {
      const first = await service.mintSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_ALICE_111111111111',
        { dataSource: mockDataSource }
      );
      const second = await service.mintSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_ALICE_111111111111',
        { dataSource: mockDataSource }
      );

      expect(first.tokenId).toBe(second.tokenId);
    });
  });

  describe('retrieval and verification methods', () => {
    it('retrieves completion NFT and sponsor NFTs', async () => {
      await service.mintCampaignCompletionNFT(mockCompletedCampaign.id, {
        dataSource: mockDataSource,
      });
      await service.mintSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_ALICE_111111111111',
        { dataSource: mockDataSource }
      );

      const completion = await service.getCampaignCompletionNFT(mockCompletedCampaign.id);
      expect(completion).not.toBeNull();
      expect(completion?.campaignId).toBe(mockCompletedCampaign.id);

      const alice = await service.getSponsorPersonalImpactNFT(
        mockCompletedCampaign.id,
        'GSPONSOR_ALICE_111111111111'
      );
      expect(alice).not.toBeNull();
      expect(alice?.sponsorAddress).toBe('GSPONSOR_ALICE_111111111111');

      const allSponsors = await service.getAllSponsorPersonalImpactNFTs(mockCompletedCampaign.id);
      expect(allSponsors.length).toBe(1);

      const sponsorNFTs = await service.getSponsorNFTs('GSPONSOR_ALICE_111111111111');
      expect(sponsorNFTs.length).toBe(1);
    });

    it('verifies impact NFT validity by token ID', async () => {
      const completion = await service.mintCampaignCompletionNFT(mockCompletedCampaign.id, {
        dataSource: mockDataSource,
      });

      const verification = await service.verifyImpactNFT(completion.tokenId);
      expect(verification.isValid).toBe(true);
      expect(verification.nftType).toBe('CAMPAIGN_COMPLETION');
      expect(verification.details.trees).toBe(600);
      expect(verification.details.co2Tonnes).toBe(12);

      const invalidVerification = await service.verifyImpactNFT('NON_EXISTENT_TOKEN');
      expect(invalidVerification.isValid).toBe(false);
    });
  });
});
