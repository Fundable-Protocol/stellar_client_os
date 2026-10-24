import { describe, expect, it, beforeEach } from "vitest";
import { CampaignRewardsPerksService } from "./campaign-rewards-perks.service";

describe("CampaignRewardsPerksService (#1178)", () => {
  let service: CampaignRewardsPerksService;
  const campaignId = "camp-123";
  const creatorAddress = "GCREATOR_STELLAR_ADDRESS_123456";

  beforeEach(() => {
    service = new CampaignRewardsPerksService();
  });

  it("allows creator to add, edit, and delete reward tiers", async () => {
    // 1. Add reward tier
    const perk = await service.createReward(campaignId, creatorAddress, {
      title: "Early Bird Supporter",
      description: "Receive a personalized thank you certificate and project stickers.",
      estimatedDeliveryDate: "2026-12-01",
      quantityLimit: 50,
      pledgeAmount: "25 XLM",
    });

    expect(perk.id).toBeDefined();
    expect(perk.title).toBe("Early Bird Supporter");
    expect(perk.quantityLimit).toBe(50);
    expect(perk.claimedCount).toBe(0);

    // Verify retrieval
    let rewards = await service.getRewards(campaignId);
    expect(rewards).toHaveLength(1);

    // 2. Edit reward tier
    const updated = await service.updateReward(campaignId, perk.id, creatorAddress, {
      title: "Super Early Bird Supporter",
      quantityLimit: 60,
    });
    expect(updated.title).toBe("Super Early Bird Supporter");
    expect(updated.quantityLimit).toBe(60);

    // 3. Delete reward tier
    const deleted = await service.deleteReward(campaignId, perk.id, creatorAddress);
    expect(deleted).toBe(true);
    rewards = await service.getRewards(campaignId);
    expect(rewards).toHaveLength(0);
  });

  it("calculates available vs claimed spots accurately and prevents over-claiming", async () => {
    const perk = await service.createReward(campaignId, creatorAddress, {
      title: "VIP Backer Access",
      description: "Exclusive digital badge & Discord role",
      estimatedDeliveryDate: "2026-11-15",
      quantityLimit: 2,
    });

    expect(service.calculateAvailableSpots(perk)).toBe(2);

    // Claim 1 spot
    await service.claimRewardSpot(campaignId, perk.id, "GBACKER_ONE");
    expect(perk.claimedCount).toBe(1);
    expect(service.calculateAvailableSpots(perk)).toBe(1);

    // Claim 2nd spot
    await service.claimRewardSpot(campaignId, perk.id, "GBACKER_TWO");
    expect(perk.claimedCount).toBe(2);
    expect(service.calculateAvailableSpots(perk)).toBe(0);

    // Attempting 3rd spot throws sold out error
    await expect(
      service.claimRewardSpot(campaignId, perk.id, "GBACKER_THREE")
    ).rejects.toThrow(/sold out/i);
  });
});
