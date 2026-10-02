import type { CampaignRecord } from "./campaign.service";

export interface CampaignImpactWidgetData {
  campaignId: string;
  title: string;
  status: CampaignRecord["status"];
  raisedAmount: string;
  goalAmount: string;
  progressPercent: number;
  treesPlanted: number;
  co2OffsetTons: number;
  sponsorCount: number;
  embedPath: string;
}

function safeInteger(value: string | number | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function buildCampaignImpactWidgetData(campaign: CampaignRecord): CampaignImpactWidgetData {
  const goal = safeInteger(campaign.goalAmount);
  const raised = safeInteger(campaign.raisedAmount);
  return {
    campaignId: campaign.id,
    title: campaign.name,
    status: campaign.status,
    raisedAmount: campaign.raisedAmount,
    goalAmount: campaign.goalAmount,
    progressPercent: goal === 0 ? 0 : Math.min(100, Math.round((raised / goal) * 100)),
    treesPlanted: safeInteger(campaign.treeCount),
    co2OffsetTons: Number((safeInteger(campaign.treeCount) * 0.022).toFixed(2)),
    sponsorCount: safeInteger(campaign.sponsorCount),
    embedPath: `/campaigns/${encodeURIComponent(campaign.id)}/widget`,
  };
}
