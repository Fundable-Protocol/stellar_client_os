/**
 * Creator Revenue Share Service — Issue #790
 *
 * Implements creator profit-sharing model where platform takes a configurable percentage (5-15%)
 * of funded amounts based on creator tier.
 */

import {
  CalculateSplitInput,
  CreatorRevenueSummary,
  CreatorTier,
  RevenueShareSplit,
  TierFeeConfig,
} from '@/types/creator-revenue-share';

export class CreatorRevenueShareService {
  private tierConfigs: Map<CreatorTier, TierFeeConfig> = new Map([
    ['BRONZE', { tier: 'BRONZE', feePercentage: 15, minRaisedThreshold: 0 }],
    ['SILVER', { tier: 'SILVER', feePercentage: 10, minRaisedThreshold: 10_000 }],
    ['GOLD', { tier: 'GOLD', feePercentage: 7.5, minRaisedThreshold: 50_000 }],
    ['PLATINUM', { tier: 'PLATINUM', feePercentage: 5, minRaisedThreshold: 200_000 }],
  ]);

  private creatorTiers: Map<string, CreatorTier> = new Map();
  private revenueRecords: Map<string, RevenueShareSplit[]> = new Map();

  /**
   * Determine creator tier based on total raised volume or stored configuration.
   */
  public getCreatorTier(creatorAddress: string): CreatorTier {
    return this.creatorTiers.get(creatorAddress.toLowerCase()) || 'BRONZE';
  }

  /**
   * Set or upgrade a creator tier manually/programmatically.
   */
  public setCreatorTier(creatorAddress: string, tier: CreatorTier): void {
    this.creatorTiers.set(creatorAddress.toLowerCase(), tier);
  }

  /**
   * Get tier fee configuration details.
   */
  public getTierConfig(tier: CreatorTier): TierFeeConfig {
    return this.tierConfigs.get(tier) || this.tierConfigs.get('BRONZE')!;
  }

  /**
   * Calculate revenue split for a given raised amount based on creator tier.
   */
  public calculateRevenueSplit(input: CalculateSplitInput): RevenueShareSplit {
    const creatorTier =
      input.creatorTier ||
      (input.creatorAddress ? this.getCreatorTier(input.creatorAddress) : 'BRONZE');

    const config = this.getTierConfig(creatorTier);
    const feePct = config.feePercentage;

    const totalAmount = Math.max(0, input.totalRaisedAmount);
    const platformFeeAmount = Number(((totalAmount * feePct) / 100).toFixed(2));
    const creatorNetAmount = Number((totalAmount - platformFeeAmount).toFixed(2));

    return {
      totalAmount,
      platformFeePercentage: feePct,
      platformFeeAmount,
      creatorNetAmount,
      creatorTier,
      currency: input.currency || 'USDC',
    };
  }

  /**
   * Record and process profit split payout for a campaign.
   */
  public async processRevenueSplit(
    campaignId: string,
    creatorAddress: string,
    totalRaisedAmount: number,
    currency: string = 'USDC'
  ): Promise<RevenueShareSplit> {
    const split = this.calculateRevenueSplit({
      totalRaisedAmount,
      creatorAddress,
      currency,
    });

    const key = creatorAddress.toLowerCase();
    const existing = this.revenueRecords.get(key) || [];
    existing.push(split);
    this.revenueRecords.set(key, existing);

    return split;
  }

  /**
   * Get earnings and fee summary for a creator.
   */
  public async getCreatorRevenueSummary(creatorAddress: string): Promise<CreatorRevenueSummary> {
    const key = creatorAddress.toLowerCase();
    const tier = this.getCreatorTier(key);
    const config = this.getTierConfig(tier);
    const records = this.revenueRecords.get(key) || [];

    const totalCampaignsFunded = records.length;
    const totalGrossRaised = records.reduce((acc, r) => acc + r.totalAmount, 0);
    const totalPlatformFeesPaid = records.reduce((acc, r) => acc + r.platformFeeAmount, 0);
    const totalNetEarnings = records.reduce((acc, r) => acc + r.creatorNetAmount, 0);

    return {
      creatorAddress,
      tier,
      feeRatePercentage: config.feePercentage,
      totalCampaignsFunded,
      totalGrossRaised,
      totalPlatformFeesPaid,
      totalNetEarnings,
    };
  }
}

export const creatorRevenueShareService = new CreatorRevenueShareService();
