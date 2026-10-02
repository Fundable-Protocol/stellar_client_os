import type { CampaignRecord } from "./campaign.service";

export type CampaignFeature = "CUSTOM_BRANDING" | "WHITE_LABEL" | "API_ACCESS";

export interface CampaignMilestoneReward {
  treesRequired: number;
  feature: CampaignFeature;
  label: string;
  description: string;
}

export const CAMPAIGN_MILESTONE_REWARDS: readonly CampaignMilestoneReward[] = [
  {
    treesRequired: 1_000,
    feature: "CUSTOM_BRANDING",
    label: "Custom branding",
    description: "Add your campaign logo, colors, and branded sponsor updates.",
  },
  {
    treesRequired: 5_000,
    feature: "WHITE_LABEL",
    label: "White-label option",
    description: "Offer a campaign experience without Fundable branding.",
  },
  {
    treesRequired: 10_000,
    feature: "API_ACCESS",
    label: "API access",
    description: "Connect campaign impact data to external integrations.",
  },
];

export interface CampaignFeatureEntitlement extends CampaignMilestoneReward {
  unlocked: boolean;
  unlockedAtTreeCount: number | null;
}

export function getCampaignFeatureEntitlements(treeCount: number): CampaignFeatureEntitlement[] {
  const safeTreeCount = Number.isFinite(treeCount) ? Math.max(0, Math.floor(treeCount)) : 0;
  return CAMPAIGN_MILESTONE_REWARDS.map((reward) => ({
    ...reward,
    unlocked: safeTreeCount >= reward.treesRequired,
    unlockedAtTreeCount: safeTreeCount >= reward.treesRequired ? reward.treesRequired : null,
  }));
}

export function getUnlockedCampaignFeatures(treeCount: number): CampaignFeature[] {
  return getCampaignFeatureEntitlements(treeCount)
    .filter((reward) => reward.unlocked)
    .map((reward) => reward.feature);
}

export interface SeasonalCarbonCreditIncentive {
  multiplier: 1 | 1.5 | 2;
  reason: "STANDARD" | "EARTH_MONTH_OR_ARBOR_DAY" | "RAINY_SEASON";
}

/**
 * Resolve the multiplier from the UTC campaign creation date. April is Earth
 * Month and includes Arbor Day (April 24). Rainy season defaults to May–October
 * and can be overridden with RAINY_SEASON_MONTHS=5,6,...,10.
 */
export function getSeasonalCarbonCreditIncentive(createdAt: number | Date): SeasonalCarbonCreditIncentive {
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(date.getTime())) return { multiplier: 1, reason: "STANDARD" };
  const month = date.getUTCMonth() + 1;
  const rainyMonths = (process.env.RAINY_SEASON_MONTHS ?? "5,6,7,8,9,10")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 12);
  if (rainyMonths.includes(month)) return { multiplier: 2, reason: "RAINY_SEASON" };
  if (month === 4) return { multiplier: 1.5, reason: "EARTH_MONTH_OR_ARBOR_DAY" };
  return { multiplier: 1, reason: "STANDARD" };
}

export function getCampaignRewardSummary(campaign: Pick<CampaignRecord, "id" | "treeCount" | "createdAt">) {
  const seasonal = getSeasonalCarbonCreditIncentive(campaign.createdAt);
  return {
    campaignId: campaign.id,
    treeCount: campaign.treeCount,
    seasonal,
    features: getCampaignFeatureEntitlements(campaign.treeCount),
  };
}
