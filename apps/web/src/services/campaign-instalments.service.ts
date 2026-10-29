import {
  BackerInstalmentPledge,
  CheckoutInstalmentPledgeInput,
  ConfigureRewardTierInput,
  InstalmentPlanBreakdown,
  InstalmentPlanMonths,
  RewardTier,
  SUPPORTED_INSTALMENT_MONTHS,
  calculateInstalmentSchedule,
  isSupportedPlanMonths,
} from "@/types/campaign-instalments";
import { getCampaign } from "./campaign.service";
import { backersService } from "./campaign-backers.service";

/**
 * Campaign Instalments Service
 *
 * Implements instalment pledge plans for high-value reward tiers:
 * - Creators can enable/disable instalment payment per reward tier
 * - Backers choose 2, 3, or 6 month plans at checkout
 * - First instalment charged at campaign close; subsequent on monthly schedule
 * - Recurring charge processor to process due instalments
 */
export class CampaignInstalmentsService {
  // In-memory store: campaignId -> RewardTier[]
  private rewardTiers: Map<string, RewardTier[]> = new Map();
  // In-memory store: pledgeId -> BackerInstalmentPledge
  private pledges: Map<string, BackerInstalmentPledge> = new Map();
  // Idempotency cache: key -> pledgeId
  private idempotencyKeys: Map<string, string> = new Map();

  /**
   * Configure or add a reward tier for a campaign (Creator).
   * Acceptance Criterion 1: Creator enables instalment option per reward tier.
   */
  public async configureRewardTier(
    campaignId: string,
    creatorAddress: string,
    input: ConfigureRewardTierInput,
  ): Promise<RewardTier> {
    if (!campaignId?.trim()) throw new Error("campaignId is required.");
    if (!creatorAddress?.trim()) throw new Error("creatorAddress is required.");
    if (!input.name?.trim()) throw new Error("Tier name is required.");

    const amountNum = parseFloat(input.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new Error("Tier amount must be a positive number.");
    }

    if (input.instalmentEnabled && input.allowedPlanMonths) {
      for (const m of input.allowedPlanMonths) {
        if (!isSupportedPlanMonths(m)) {
          throw new Error(`Unsupported plan duration: ${m}. Only 2, 3, or 6 months allowed.`);
        }
      }
    }

    const tiers = this.rewardTiers.get(campaignId) || [];
    const now = Date.now();
    const tierId = input.id || `tier-${campaignId}-${now}-${tiers.length + 1}`;

    const existingIndex = tiers.findIndex((t) => t.id === tierId);

    const newTier: RewardTier = {
      id: tierId,
      campaignId,
      name: input.name.trim(),
      description: input.description?.trim(),
      amount: amountNum.toFixed(2),
      token: input.token || "USDC",
      instalmentEnabled: Boolean(input.instalmentEnabled),
      allowedPlanMonths: input.instalmentEnabled
        ? input.allowedPlanMonths && input.allowedPlanMonths.length > 0
          ? input.allowedPlanMonths
          : [...SUPPORTED_INSTALMENT_MONTHS]
        : [],
      perks: input.perks || [],
      limit: input.limit,
      nftReward: input.nftReward,
      claimed: existingIndex >= 0 ? tiers[existingIndex].claimed : 0,
      createdAt: existingIndex >= 0 ? tiers[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      tiers[existingIndex] = newTier;
    } else {
      tiers.push(newTier);
    }

    this.rewardTiers.set(campaignId, tiers);
    return newTier;
  }

  /**
   * Get all reward tiers configured for a campaign.
   */
  public getRewardTiers(campaignId: string): RewardTier[] {
    return this.rewardTiers.get(campaignId) || [];
  }

  /**
   * Get a specific reward tier by ID.
   */
  public getRewardTier(campaignId: string, tierId: string): RewardTier | undefined {
    const tiers = this.getRewardTiers(campaignId);
    return tiers.find((t) => t.id === tierId);
  }

  /**
   * Get breakdown for a reward tier with an instalment plan option.
   * Acceptance Criterion 2 & 3:
   * - Backers choose 2, 3, or 6 month plans
   * - First instalment charged at campaign close; subsequent on monthly schedule
   */
  public async getInstalmentPlanBreakdown(
    campaignId: string,
    tierId: string,
    planMonths: InstalmentPlanMonths,
    customCloseDate?: number,
  ): Promise<InstalmentPlanBreakdown> {
    if (!isSupportedPlanMonths(planMonths)) {
      throw new Error("Invalid plan duration. Supported plans are 2, 3, or 6 months.");
    }

    const tier = this.getRewardTier(campaignId, tierId);
    if (!tier) {
      throw new Error(`Reward tier ${tierId} not found.`);
    }

    if (!tier.instalmentEnabled) {
      throw new Error(`Instalment payment is not enabled for reward tier "${tier.name}".`);
    }

    if (tier.allowedPlanMonths && !tier.allowedPlanMonths.includes(planMonths)) {
      throw new Error(`Plan duration of ${planMonths} months is not offered for this reward tier.`);
    }

    // Determine campaign close date
    let closeDate = customCloseDate;
    if (!closeDate) {
      const campaign = await getCampaign(campaignId);
      if (campaign && campaign.deadline) {
        closeDate = typeof campaign.deadline === "number" ? campaign.deadline : Date.now() + 30 * 24 * 60 * 60 * 1000;
      } else {
        // Fallback default: 30 days from now
        closeDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      }
    }

    const { monthlyAmount, schedule } = calculateInstalmentSchedule(tier.amount, planMonths, closeDate);

    return {
      totalAmount: tier.amount,
      months: planMonths,
      monthlyAmount,
      firstPaymentDate: closeDate,
      schedule,
    };
  }

  /**
   * Backer checkout with an instalment plan.
   * Acceptance Criteria:
   * - Backer chooses 2, 3, or 6 month plan
   * - First instalment scheduled for campaign close date
   * - Subsequent instalments scheduled on 30-day intervals
   */
  public async checkoutWithInstalments(
    input: CheckoutInstalmentPledgeInput,
  ): Promise<BackerInstalmentPledge> {
    const { campaignId, tierId, backerAddress, planMonths, idempotencyKey } = input;

    if (!campaignId?.trim()) throw new Error("campaignId is required.");
    if (!tierId?.trim()) throw new Error("tierId is required.");
    if (!backerAddress?.trim()) throw new Error("backerAddress is required.");

    if (!isSupportedPlanMonths(planMonths)) {
      throw new Error("Invalid plan duration. Backers must choose a 2, 3, or 6 month plan.");
    }

    // Check idempotency
    if (idempotencyKey) {
      const existingPledgeId = this.idempotencyKeys.get(`${campaignId}:${idempotencyKey}`);
      if (existingPledgeId && this.pledges.has(existingPledgeId)) {
        return this.pledges.get(existingPledgeId)!;
      }
    }

    const tier = this.getRewardTier(campaignId, tierId);
    if (!tier) {
      throw new Error(`Reward tier "${tierId}" not found for this campaign.`);
    }

    if (!tier.instalmentEnabled) {
      throw new Error(`Instalments are not enabled for reward tier "${tier.name}".`);
    }

    if (tier.allowedPlanMonths && !tier.allowedPlanMonths.includes(planMonths)) {
      throw new Error(`${planMonths}-month instalment plan is not available for this tier.`);
    }

    if (tier.limit && (tier.claimed ?? 0) >= tier.limit) {
      throw new Error(`Reward tier "${tier.name}" is sold out.`);
    }

    // Determine campaign close date
    let campaignCloseDate = input.customCampaignCloseDate;
    if (!campaignCloseDate) {
      const campaign = await getCampaign(campaignId);
      if (campaign && campaign.deadline) {
        campaignCloseDate = campaign.deadline;
      } else {
        campaignCloseDate = Date.now() + 30 * 24 * 60 * 60 * 1000;
      }
    }

    const breakdown = calculateInstalmentSchedule(tier.amount, planMonths, campaignCloseDate);

    const now = Date.now();
    const pledgeId = `inst-pledge-${campaignId}-${now}-${Math.random().toString(36).slice(2, 7)}`;

    const schedule = breakdown.schedule.map((item) => ({
      instalmentNumber: item.instalmentNumber,
      amount: item.amount,
      dueDate: item.dueDate,
      status: "PENDING" as const,
    }));

    const pledge: BackerInstalmentPledge = {
      id: pledgeId,
      campaignId,
      tierId: tier.id,
      tierName: tier.name,
      backerAddress: backerAddress.trim(),
      backerEmail: input.backerEmail?.trim(),
      token: tier.token,
      totalAmount: tier.amount,
      planMonths,
      monthlyAmount: breakdown.monthlyAmount,
      campaignCloseDate,
      status: "ACTIVE",
      schedule,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    };

    // Increment tier claimed count
    tier.claimed = (tier.claimed ?? 0) + 1;
    tier.updatedAt = now;

    this.pledges.set(pledgeId, pledge);
    if (idempotencyKey) {
      this.idempotencyKeys.set(`${campaignId}:${idempotencyKey}`, pledgeId);
    }

    return pledge;
  }

  /**
   * Get all instalment pledges for a backer across campaigns or for a specific campaign.
   */
  public getBackerInstalments(backerAddress: string, campaignId?: string): BackerInstalmentPledge[] {
    const normalized = backerAddress.trim().toLowerCase();
    const results: BackerInstalmentPledge[] = [];

    for (const pledge of this.pledges.values()) {
      if (pledge.backerAddress.toLowerCase() === normalized) {
        if (!campaignId || pledge.campaignId === campaignId) {
          results.push(pledge);
        }
      }
    }

    return results;
  }

  /**
   * Get all instalment pledges for a campaign (Creator view).
   */
  public getCampaignInstalmentPledges(campaignId: string): BackerInstalmentPledge[] {
    return Array.from(this.pledges.values()).filter((p) => p.campaignId === campaignId);
  }

  /**
   * Get specific instalment pledge by ID.
   */
  public getPledge(pledgeId: string): BackerInstalmentPledge | undefined {
    return this.pledges.get(pledgeId);
  }

  /**
   * Process due instalment payments at or past the given timestamp (e.g. at campaign close or monthly trigger).
   * Acceptance Criterion 3: First instalment charged at campaign close; subsequent on monthly schedule.
   */
  public async processDueInstalments(asOfTimestamp: number = Date.now()): Promise<{
    processedCount: number;
    chargedInstalments: Array<{
      pledgeId: string;
      instalmentNumber: number;
      amount: string;
      chargedAt: number;
      txHash: string;
    }>;
  }> {
    const chargedInstalments: Array<{
      pledgeId: string;
      instalmentNumber: number;
      amount: string;
      chargedAt: number;
      txHash: string;
    }> = [];

    for (const pledge of this.pledges.values()) {
      if (pledge.status !== "ACTIVE") continue;

      let allCharged = true;

      for (const item of pledge.schedule) {
        if (item.status === "PENDING" && item.dueDate <= asOfTimestamp) {
          // Simulate charging the instalment on-chain
          const txHash = `0xinst_${pledge.id}_${item.instalmentNumber}_${Date.now().toString(16)}`;
          item.status = "CHARGED";
          item.chargedAt = asOfTimestamp;
          item.txHash = txHash;

          chargedInstalments.push({
            pledgeId: pledge.id,
            instalmentNumber: item.instalmentNumber,
            amount: item.amount,
            chargedAt: asOfTimestamp,
            txHash,
          });

          // Record contribution to campaign backers ledger
          try {
            backersService.recordContribution({
              campaignId: pledge.campaignId,
              backerAddress: pledge.backerAddress,
              amount: item.amount,
              token: pledge.token,
              message: `Instalment ${item.instalmentNumber} of ${pledge.planMonths} for ${pledge.tierName}`,
            });
          } catch {
            // Ledger recording fallback
          }
        }

        if (item.status !== "CHARGED") {
          allCharged = false;
        }
      }

      if (allCharged) {
        pledge.status = "COMPLETED";
      }
      pledge.updatedAt = asOfTimestamp;
    }

    return {
      processedCount: chargedInstalments.length,
      chargedInstalments,
    };
  }

  /**
   * Reset in-memory state (useful for tests).
   */
  public clearAll() {
    this.rewardTiers.clear();
    this.pledges.clear();
    this.idempotencyKeys.clear();
  }
}

export const campaignInstalmentsService = new CampaignInstalmentsService();
