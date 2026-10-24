import {
  BackerRewardPerk,
  CreateRewardPerkInput,
  UpdateRewardPerkInput,
} from "@/types/campaign-rewards-perks";

export class CampaignRewardsPerksService {
  private rewardsStore: Map<string, BackerRewardPerk[]> = new Map();

  constructor() {}

  public calculateAvailableSpots(reward: BackerRewardPerk): number {
    return Math.max(0, reward.quantityLimit - (reward.claimedCount || 0));
  }

  public async getRewards(campaignId: string): Promise<BackerRewardPerk[]> {
    return this.rewardsStore.get(campaignId) || [];
  }

  public async createReward(
    campaignId: string,
    creatorAddress: string,
    input: CreateRewardPerkInput
  ): Promise<BackerRewardPerk> {
    if (!creatorAddress) throw new Error("Creator address is required");
    if (!input.title?.trim()) throw new Error("Reward title is required");
    if (!input.description?.trim()) throw new Error("Reward description is required");
    if (!input.estimatedDeliveryDate?.trim()) throw new Error("Estimated delivery date is required");
    if (typeof input.quantityLimit !== "number" || input.quantityLimit <= 0) {
      throw new Error("Quantity limit must be a positive number");
    }

    const newReward: BackerRewardPerk = {
      id: `perk-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      campaignId,
      title: input.title.trim(),
      description: input.description.trim(),
      estimatedDeliveryDate: input.estimatedDeliveryDate.trim(),
      quantityLimit: input.quantityLimit,
      claimedCount: 0,
      pledgeAmount: input.pledgeAmount,
      shippingType: input.shippingType || 'digital',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const existing = this.rewardsStore.get(campaignId) || [];
    existing.push(newReward);
    this.rewardsStore.set(campaignId, existing);

    return newReward;
  }

  public async updateReward(
    campaignId: string,
    rewardId: string,
    creatorAddress: string,
    input: UpdateRewardPerkInput
  ): Promise<BackerRewardPerk> {
    if (!creatorAddress) throw new Error("Creator address is required");

    const existing = this.rewardsStore.get(campaignId) || [];
    const index = existing.findIndex((r) => r.id === rewardId);
    if (index === -1) throw new Error(`Reward perk ${rewardId} not found`);

    const current = existing[index];
    const updated: BackerRewardPerk = {
      ...current,
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.estimatedDeliveryDate !== undefined ? { estimatedDeliveryDate: input.estimatedDeliveryDate.trim() } : {}),
      ...(input.quantityLimit !== undefined ? { quantityLimit: input.quantityLimit } : {}),
      ...(input.pledgeAmount !== undefined ? { pledgeAmount: input.pledgeAmount } : {}),
      ...(input.shippingType !== undefined ? { shippingType: input.shippingType } : {}),
      ...(input.claimedCount !== undefined ? { claimedCount: input.claimedCount } : {}),
      updatedAt: new Date().toISOString(),
    };

    existing[index] = updated;
    this.rewardsStore.set(campaignId, existing);
    return updated;
  }

  public async deleteReward(
    campaignId: string,
    rewardId: string,
    creatorAddress: string
  ): Promise<boolean> {
    if (!creatorAddress) throw new Error("Creator address is required");

    const existing = this.rewardsStore.get(campaignId) || [];
    const filtered = existing.filter((r) => r.id !== rewardId);
    if (filtered.length === existing.length) return false;

    this.rewardsStore.set(campaignId, filtered);
    return true;
  }

  public async claimRewardSpot(
    campaignId: string,
    rewardId: string,
    backerAddress: string
  ): Promise<BackerRewardPerk> {
    if (!backerAddress) throw new Error("Backer address is required");

    const existing = this.rewardsStore.get(campaignId) || [];
    const reward = existing.find((r) => r.id === rewardId);
    if (!reward) throw new Error(`Reward perk ${rewardId} not found`);

    const available = this.calculateAvailableSpots(reward);
    if (available <= 0) {
      throw new Error(`Reward perk "${reward.title}" is sold out`);
    }

    reward.claimedCount += 1;
    reward.updatedAt = new Date().toISOString();
    return reward;
  }
}

export const campaignRewardsPerksService = new CampaignRewardsPerksService();
