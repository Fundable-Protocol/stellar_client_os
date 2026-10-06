import { getCampaignDataSource, type CampaignRecord } from "./campaign.service";

const CO2_PER_TREE_PER_YEAR_KG = 21;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface AdminAnalyticsDashboard {
  updatedAt: number;
  currencyUnit: "stroops";
  period: "all-time";
  metrics: {
    activeCampaigns: number;
    totalTreesPlanted: number;
    totalCo2SequesteredKg: number;
    totalSponsors: number;
    sponsorGrowthPercent: number;
    campaignCompletionRate: number;
    revenue: string;
  };
  monthlyTrend: Array<{
    month: string;
    campaigns: number;
    sponsors: number;
    revenue: string;
  }>;
}

function percentage(value: number, total: number): number {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}

function monthKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 7);
}

function addMonths(month: string, count: number): string {
  const date = new Date(`${month}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + count);
  return date.toISOString().slice(0, 7);
}

function sumAmounts(campaigns: CampaignRecord[]): bigint {
  return campaigns.reduce((total, campaign) => {
    return total + (/^\d+$/.test(campaign.raisedAmount) ? BigInt(campaign.raisedAmount) : 0n);
  }, 0n);
}

export async function getAdminAnalyticsDashboard(
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<AdminAnalyticsDashboard> {
  const campaigns = await dataSource.getCampaigns();
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "ACTIVE").length;
  const completedCampaigns = campaigns.filter((campaign) => campaign.status === "COMPLETED").length;
  const totalSponsors = campaigns.reduce((total, campaign) => total + campaign.sponsorCount, 0);
  const recentSponsors = campaigns
    .filter((campaign) => campaign.createdAt >= now - WINDOW_MS)
    .reduce((total, campaign) => total + campaign.sponsorCount, 0);
  const previousSponsors = campaigns
    .filter((campaign) => campaign.createdAt >= now - WINDOW_MS * 2 && campaign.createdAt < now - WINDOW_MS)
    .reduce((total, campaign) => total + campaign.sponsorCount, 0);
  const sponsorGrowthPercent = previousSponsors === 0
    ? (recentSponsors > 0 ? 100 : 0)
    : percentage(recentSponsors - previousSponsors, previousSponsors);

  const currentMonth = monthKey(now);
  const monthlyTrend = Array.from({ length: 6 }, (_, index) => addMonths(currentMonth, index - 5)).map((month) => {
    const monthCampaigns = campaigns.filter((campaign) => monthKey(campaign.createdAt) === month);
    return {
      month,
      campaigns: monthCampaigns.length,
      sponsors: monthCampaigns.reduce((total, campaign) => total + campaign.sponsorCount, 0),
      revenue: sumAmounts(monthCampaigns).toString(),
    };
  });

  return {
    updatedAt: now,
    currencyUnit: "stroops",
    period: "all-time",
    metrics: {
      activeCampaigns,
      totalTreesPlanted: campaigns.reduce((total, campaign) => total + campaign.treeCount, 0),
      totalCo2SequesteredKg: campaigns.reduce((total, campaign) => total + campaign.treeCount * CO2_PER_TREE_PER_YEAR_KG, 0),
      totalSponsors,
      sponsorGrowthPercent,
      campaignCompletionRate: percentage(completedCampaigns, campaigns.length),
      revenue: sumAmounts(campaigns).toString(),
    },
    monthlyTrend,
  };
}