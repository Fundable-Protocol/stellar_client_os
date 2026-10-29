import { describe, it, expect, beforeEach } from "vitest";
import {
  CampaignNFTRewardService,
  NFTRewardTierError,
} from "./campaign-nft-reward.service";
import { CampaignRecord } from "./campaign.service";

describe("CampaignNFTRewardService", () => {
  let service: CampaignNFTRewardService;
  const campaignId = "camp-nft-rewards-test";
  const creatorAddress = "GCREATOR_TEST_123456789";
  const backer1 = "GBACKER_ONE_111111111";
  const backer2 = "GBACKER_TWO_222222222";
  const backer3 = "GBACKER_THREE_33333333";

  // Mock campaign data source
  const createMockDataSource = (status: CampaignRecord["status"] = "COMPLETED", deadline = Date.now() - 1000) => {
    const campaign: CampaignRecord = {
      id: campaignId,
      name: "Stellar Rainforest Conservation",
      description: "Protecting endangered rain forests",
      creator: creatorAddress,
      creatorAddress,
      status,
      deadline,
      goalAmount: "5000",
      raisedAmount: "5500",
      treeCount: 500,
      sponsorCount: 3,
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now(),
      statusChangedAt: Date.now(),
      statusHistory: [],
      sponsors: [],
    };

    return {
      getCampaigns: async () => [campaign],
      getCampaign: async (id: string) => (id === campaignId ? campaign : null),
      saveCampaign: async (c: CampaignRecord) => c,
    };
  };

  beforeEach(() => {
    service = new CampaignNFTRewardService();
    service.clearAll();
  });

  describe("Acceptance Criterion 1: Creator defines NFT reward tier and uploads asset", () => {
    it("allows a creator to define an NFT reward tier with an uploaded asset", async () => {
      const tier = await service.defineNFTRewardTier(campaignId, creatorAddress, {
        name: "Emerald Forest Guardian",
        description: "Official commemorative NFT verifying sponsorship of 50 trees.",
        minimumPledge: "250.00",
        token: "USDC",
        asset: {
          assetUrl: "https://ipfs.io/ipfs/QmGuardianNFTAssetHash/artwork.png",
          fileName: "guardian.png",
          fileSize: 2048576,
          mimeType: "image/png",
        },
        maxSupply: 10,
        symbol: "EMERALD",
      });

      expect(tier.id).toBeDefined();
      expect(tier.campaignId).toBe(campaignId);
      expect(tier.name).toBe("Emerald Forest Guardian");
      expect(tier.minimumPledge).toBe("250.00");
      expect(tier.asset.assetUrl).toBe("https://ipfs.io/ipfs/QmGuardianNFTAssetHash/artwork.png");
      expect(tier.maxSupply).toBe(10);
      expect(tier.mintOnClose).toBe(true);

      const allTiers = service.getNFTRewardTiers(campaignId);
      expect(allTiers.length).toBe(1);
      expect(allTiers[0].name).toBe("Emerald Forest Guardian");
    });

    it("rejects tier definition when asset is missing or invalid", async () => {
      await expect(
        service.defineNFTRewardTier(campaignId, creatorAddress, {
          name: "Invalid Asset Tier",
          minimumPledge: "100.00",
          // @ts-expect-error - testing invalid asset
          asset: { assetUrl: "" },
        })
      ).rejects.toThrow("Uploaded asset URL is required");

      await expect(
        service.defineNFTRewardTier(campaignId, creatorAddress, {
          name: "Invalid URL Tier",
          minimumPledge: "100.00",
          asset: { assetUrl: "not-a-valid-url" },
        })
      ).rejects.toThrow("Asset URL must be a valid HTTPS URL, IPFS URI, or image data URI");
    });

    it("rejects non-positive minimum pledge amount", async () => {
      await expect(
        service.defineNFTRewardTier(campaignId, creatorAddress, {
          name: "Free Tier",
          minimumPledge: "0",
          asset: { assetUrl: "https://example.com/asset.png" },
        })
      ).rejects.toThrow("minimumPledge must be a positive number");
    });
  });

  describe("Acceptance Criteria 2 & 3: NFT minted on Stellar on campaign close & Backer receives NFT in wallet", () => {
    it("automatically mints and airdrops reward NFTs to eligible backers when campaign closes", async () => {
      // 1. Creator defines 2 tiers
      const tierSilver = await service.defineNFTRewardTier(campaignId, creatorAddress, {
        name: "Silver Supporter NFT",
        minimumPledge: "100.00",
        asset: { assetUrl: "https://ipfs.io/ipfs/QmSilverAsset/silver.png" },
      });

      const tierGold = await service.defineNFTRewardTier(campaignId, creatorAddress, {
        name: "Gold Champion NFT",
        minimumPledge: "500.00",
        asset: { assetUrl: "https://ipfs.io/ipfs/QmGoldAsset/gold.png" },
      });

      // 2. Backers pledged
      service.recordBackerEligibility(campaignId, {
        backerAddress: backer1,
        pledgedAmount: "150.00",
        tierId: tierSilver.id,
        backedAt: Date.now() - 3600000,
      });

      service.recordBackerEligibility(campaignId, {
        backerAddress: backer2,
        pledgedAmount: "500.00",
        tierId: tierGold.id,
        backedAt: Date.now() - 1800000,
      });

      // Backer 3 pledged below minimum for Gold
      service.recordBackerEligibility(campaignId, {
        backerAddress: backer3,
        pledgedAmount: "50.00",
        tierId: "other-tier",
        backedAt: Date.now() - 900000,
      });

      // 3. Campaign completes and airdrops are triggered
      const result = await service.processCampaignCloseAirdrops(campaignId, {
        dataSource: createMockDataSource("COMPLETED"),
      });

      expect(result.totalTiers).toBe(2);
      expect(result.totalAirdropped).toBe(2); // backer1 got Silver, backer2 got Gold

      const airdrop1 = result.airdrops.find((a) => a.recipientAddress === backer1);
      expect(airdrop1).toBeDefined();
      expect(airdrop1?.tierName).toBe("Silver Supporter NFT");
      expect(airdrop1?.status).toBe("DELIVERED");
      expect(airdrop1?.tokenId).toContain("NFT-REW");
      expect(airdrop1?.txHash).toBeDefined();

      const airdrop2 = result.airdrops.find((a) => a.recipientAddress === backer2);
      expect(airdrop2).toBeDefined();
      expect(airdrop2?.tierName).toBe("Gold Champion NFT");
      expect(airdrop2?.status).toBe("DELIVERED");

      // 4. Backer can inspect their received NFTs in wallet
      const backer1WalletNFTs = service.getBackerRewardNFTs(backer1);
      expect(backer1WalletNFTs.length).toBe(1);
      expect(backer1WalletNFTs[0].recipientAddress).toBe(backer1);
      expect(backer1WalletNFTs[0].tierName).toBe("Silver Supporter NFT");

      const backer2WalletNFTs = service.getBackerRewardNFTs(backer2);
      expect(backer2WalletNFTs.length).toBe(1);
      expect(backer2WalletNFTs[0].recipientAddress).toBe(backer2);
      expect(backer2WalletNFTs[0].tierName).toBe("Gold Champion NFT");
    });

    it("prevents duplicate airdrops on multiple campaign close checks", async () => {
      await service.defineNFTRewardTier(campaignId, creatorAddress, {
        name: "Silver Supporter NFT",
        minimumPledge: "100.00",
        asset: { assetUrl: "https://ipfs.io/ipfs/QmSilverAsset/silver.png" },
      });

      service.recordBackerEligibility(campaignId, {
        backerAddress: backer1,
        pledgedAmount: "100.00",
        tierId: "",
        backedAt: Date.now(),
      });

      const firstPass = await service.processCampaignCloseAirdrops(campaignId, {
        dataSource: createMockDataSource("COMPLETED"),
      });
      expect(firstPass.totalAirdropped).toBe(1);

      // Repeat processing (e.g. idempotent retry)
      const secondPass = await service.processCampaignCloseAirdrops(campaignId, {
        dataSource: createMockDataSource("COMPLETED"),
      });
      expect(secondPass.totalAirdropped).toBe(0); // No duplicates
    });

    it("rejects processing if campaign is still active and not closed", async () => {
      await service.defineNFTRewardTier(campaignId, creatorAddress, {
        name: "Active Tier",
        minimumPledge: "100.00",
        asset: { assetUrl: "https://ipfs.io/ipfs/QmActive/asset.png" },
      });

      await expect(
        service.processCampaignCloseAirdrops(campaignId, {
          dataSource: createMockDataSource("ACTIVE", Date.now() + 86400000), // deadline in future
        })
      ).rejects.toThrow("Campaign \"camp-nft-rewards-test\" is not closed yet");
    });
  });
});
