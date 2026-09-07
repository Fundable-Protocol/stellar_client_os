import {
  getCampaign,
  getCampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export interface CampaignAnalytics {
  campaignId: string;
  pagesViewed: number;
  uniqueViewers: number;
  contributions: number;
  sponsors: number;
  sponsorRate: number;
  abandonmentRate: number;
  averageContributionSize: string;
  refunds: number;
  refundRate: number;
  updatedAt: number;
}

interface CampaignAnalyticsState {
  totalViews: number;
  views: Set<string>;
  contributions: Array<{ amount: bigint; sponsor: string }>;
  refunds: number;
}

const states = new Map<string, CampaignAnalyticsState>();

function stateFor(campaignId: string): CampaignAnalyticsState {
  let state = states.get(campaignId);
  if (!state) {
    state = { totalViews: 0, views: new Set(), contributions: [], refunds: 0 };
    states.set(campaignId, state);
  }
  return state;
}

function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) throw new Error("amount must be a non-negative integer string");
  return BigInt(amount);
}

function toRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 10_000) / 100;
}

export async function recordCampaignView(
  campaignId: string,
  viewerId?: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  const state = stateFor(campaignId);
  state.totalViews += 1;
  state.views.add(viewerId?.trim() || `anonymous:${crypto.randomUUID()}`);
}

export async function recordCampaignContribution(
  campaignId: string,
  amount: string,
  sponsor: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  if (!sponsor?.trim()) throw new Error("sponsor is required");
  stateFor(campaignId).contributions.push({ amount: parseAmount(amount), sponsor: sponsor.trim() });
}

export async function recordCampaignRefund(
  campaignId: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  stateFor(campaignId).refunds += 1;
}

export function clearCampaignAnalytics(campaignId: string): void {
  states.delete(campaignId);
}

export async function getCampaignAnalytics(
  campaignId: string,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignAnalytics | null> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) return null;
  const state = stateFor(campaignId);
  const sponsors = new Set([
    ...campaign.sponsors.map((sponsor) => sponsor.address),
    ...state.contributions.map((contribution) => contribution.sponsor),
  ]);
  const sponsorCount = Math.max(sponsors.size, campaign.sponsorCount);
  const contributionCount = state.contributions.length || campaign.sponsorCount;
  const total = state.contributions.reduce((sum, contribution) => sum + contribution.amount, 0n);
  const fallbackTotal = state.contributions.length === 0 ? BigInt(campaign.raisedAmount) : total;
  const average = contributionCount === 0 ? 0n : fallbackTotal / BigInt(contributionCount);
  const pagesViewed = state.totalViews;

  return {
    campaignId,
    pagesViewed,
    uniqueViewers: state.views.size,
    contributions: contributionCount,
    sponsors: sponsorCount,
    sponsorRate: toRate(sponsorCount, pagesViewed),
    abandonmentRate: toRate(Math.max(pagesViewed - sponsorCount, 0), pagesViewed),
    averageContributionSize: average.toString(),
    refunds: state.refunds,
    refundRate: toRate(state.refunds, contributionCount),
    updatedAt: now,
  };
}

export function seedCampaignAnalytics(campaignId: string, state: Partial<CampaignAnalyticsState>): void {
  states.set(campaignId, {
    totalViews: state.totalViews ?? state.views?.size ?? 0,
    views: state.views ?? new Set(),
    contributions: state.contributions ?? [],
    refunds: state.refunds ?? 0,
  });
}

export type { CampaignRecord };
