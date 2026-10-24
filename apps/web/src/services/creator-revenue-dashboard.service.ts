import {
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";
import { creatorRevenueShareService } from "./creator-revenue-share.service";

export type RevenuePeriod = "7d" | "30d" | "90d" | "all";
export type RevenueSettlement = "pending" | "settled";

export interface CampaignRevenueBreakdown {
  campaignId: string;
  campaignName: string;
  period: RevenuePeriod;
  grossAmount: number;
  platformFee: number;
  netAmount: number;
  settlement: RevenueSettlement;
  currency: string;
  earnedAt: number;
}

export interface CreatorRevenueDashboard {
  creatorAddress: string;
  period: RevenuePeriod;
  currency: string;
  totals: {
    grossAmount: number;
    platformFees: number;
    netEarned: number;
    pendingWithdrawals: number;
    settledAmount: number;
    availableToWithdraw: number;
  };
  campaigns: CampaignRevenueBreakdown[];
  generatedAt: number;
}

export interface WithdrawalRequest {
  id: string;
  creatorAddress: string;
  amount: number;
  currency: string;
  status: "requested";
  requestedAt: number;
}

const withdrawalRequests = new Map<string, WithdrawalRequest[]>();
const periodStart = (period: RevenuePeriod, now: number): number | null => {
  const days = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 90 : null;
  return days === null ? null : now - days * 24 * 60 * 60 * 1000;
};

export async function getCreatorRevenueDashboard(
  creatorAddress: string,
  period: RevenuePeriod = "30d",
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CreatorRevenueDashboard> {
  const normalizedCreator = creatorAddress.trim();
  if (!normalizedCreator) throw new Error("creatorAddress is required");
  const start = periodStart(period, now);
  const campaigns = (await dataSource.getCampaigns()).filter(
    (campaign) => campaign.creator.toLowerCase() === normalizedCreator.toLowerCase(),
  );
  const breakdowns = campaigns
    .filter((campaign) => start === null || campaign.updatedAt >= start)
    .map((campaign): CampaignRevenueBreakdown => {
      const split = creatorRevenueShareService.calculateRevenueSplit({
        totalRaisedAmount: Number(campaign.raisedAmount) || 0,
        creatorAddress: normalizedCreator,
        currency: "USDC",
      });
      return {
        campaignId: campaign.id,
        campaignName: campaign.name,
        period,
        grossAmount: split.totalAmount,
        platformFee: split.platformFeeAmount,
        netAmount: split.creatorNetAmount,
        settlement: campaign.status === "COMPLETED" ? "settled" : "pending",
        currency: split.currency,
        earnedAt: campaign.updatedAt,
      };
    });
  const grossAmount = breakdowns.reduce((sum, item) => sum + item.grossAmount, 0);
  const platformFees = breakdowns.reduce((sum, item) => sum + item.platformFee, 0);
  const netEarned = breakdowns.reduce((sum, item) => sum + item.netAmount, 0);
  const pendingWithdrawals = breakdowns
    .filter((item) => item.settlement === "pending")
    .reduce((sum, item) => sum + item.netAmount, 0);
  const settledAmount = breakdowns
    .filter((item) => item.settlement === "settled")
    .reduce((sum, item) => sum + item.netAmount, 0);
  const requested = (withdrawalRequests.get(normalizedCreator.toLowerCase()) ?? []).reduce(
    (sum, request) => sum + request.amount,
    0,
  );
  return {
    creatorAddress: normalizedCreator,
    period,
    currency: "USDC",
    totals: {
      grossAmount: Number(grossAmount.toFixed(2)),
      platformFees: Number(platformFees.toFixed(2)),
      netEarned: Number(netEarned.toFixed(2)),
      pendingWithdrawals: Number(pendingWithdrawals.toFixed(2)),
      settledAmount: Number(settledAmount.toFixed(2)),
      availableToWithdraw: Number(Math.max(0, settledAmount - requested).toFixed(2)),
    },
    campaigns: breakdowns,
    generatedAt: now,
  };
}

export async function initiateCreatorWithdrawal(
  creatorAddress: string,
  amount: number | undefined,
  dataSource: CampaignDataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<WithdrawalRequest> {
  const dashboard = await getCreatorRevenueDashboard(creatorAddress, "all", dataSource, now);
  const requestedAmount = amount ?? dashboard.totals.availableToWithdraw;
  if (!Number.isFinite(requestedAmount) || requestedAmount <= 0) throw new Error("Withdrawal amount must be greater than zero");
  if (requestedAmount > dashboard.totals.availableToWithdraw) throw new Error("Withdrawal amount exceeds settled funds available");
  const request: WithdrawalRequest = {
    id: `withdrawal-${now}-${Math.random().toString(36).slice(2, 8)}`,
    creatorAddress: creatorAddress.trim(),
    amount: Number(requestedAmount.toFixed(2)),
    currency: dashboard.currency,
    status: "requested",
    requestedAt: now,
  };
  const key = creatorAddress.trim().toLowerCase();
  withdrawalRequests.set(key, [...(withdrawalRequests.get(key) ?? []), request]);
  return request;
}

export function clearCreatorRevenueState(): void {
  withdrawalRequests.clear();
}

export type { CampaignRecord };
