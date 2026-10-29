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

export type TrafficSource = "direct" | "social" | "search" | "referral" | "email" | "other";

export type ConversionStage = "view" | "pledge_started" | "pledge_completed";

export interface DailyVelocity {
  date: string;
  totalPledged: string;
  contributionCount: number;
}

interface CampaignAnalyticsState {
  totalViews: number;
  views: Set<string>;
  contributions: Array<{ amount: bigint; sponsor: string; at: number }>;
  refunds: number;
  trafficSources: Map<TrafficSource, number>;
  conversions: Map<ConversionStage, Set<string>>;
}

const states = new Map<string, CampaignAnalyticsState>();

const TRAFFIC_SOURCES: readonly TrafficSource[] = [
  "direct",
  "social",
  "search",
  "referral",
  "email",
  "other",
];

const CONVERSION_STAGES: readonly ConversionStage[] = [
  "view",
  "pledge_started",
  "pledge_completed",
];

function normalizeSource(source?: string): TrafficSource {
  const value = source?.trim().toLowerCase();
  return TRAFFIC_SOURCES.includes(value as TrafficSource) ? (value as TrafficSource) : "other";
}

function normalizeStage(stage?: string): ConversionStage {
  const value = stage?.trim().toLowerCase();
  if (!CONVERSION_STAGES.includes(value as ConversionStage)) {
    throw new Error("stage must be one of view, pledge_started, pledge_completed");
  }
  return value as ConversionStage;
}

function stateFor(campaignId: string): CampaignAnalyticsState {
  let state = states.get(campaignId);
  if (!state) {
    state = {
      totalViews: 0,
      views: new Set(),
      contributions: [],
      refunds: 0,
      trafficSources: new Map(),
      conversions: new Map(),
    };
    states.set(campaignId, state);
  }
  return state;
}

function dayKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
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

export async function recordPageView(
  campaignId: string,
  viewerId?: string,
  source?: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  const state = stateFor(campaignId);
  state.totalViews += 1;
  state.views.add(viewerId?.trim() || `anonymous:${crypto.randomUUID()}`);
  const trafficSource = normalizeSource(source);
  state.trafficSources.set(trafficSource, (state.trafficSources.get(trafficSource) ?? 0) + 1);
}

export async function recordConversion(
  campaignId: string,
  viewerId: string,
  stage: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  if (!viewerId?.trim()) throw new Error("viewerId is required");
  const conversionStage = normalizeStage(stage);
  const state = stateFor(campaignId);
  let viewers = state.conversions.get(conversionStage);
  if (!viewers) {
    viewers = new Set();
    state.conversions.set(conversionStage, viewers);
  }
  viewers.add(viewerId.trim());
}

export async function recordCampaignContribution(
  campaignId: string,
  amount: string,
  sponsor: string,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
  if (!sponsor?.trim()) throw new Error("sponsor is required");
  stateFor(campaignId).contributions.push({
    amount: parseAmount(amount),
    sponsor: sponsor.trim(),
    at: now,
  });
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

export function getDailyVelocity(campaignId: string): DailyVelocity[] {
  const state = states.get(campaignId);
  if (!state) return [];
  const byDay = new Map<string, { total: bigint; count: number }>();
  for (const contribution of state.contributions) {
    const key = dayKey(contribution.at);
    const entry = byDay.get(key) ?? { total: 0n, count: 0 };
    entry.total += contribution.amount;
    entry.count += 1;
    byDay.set(key, entry);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, entry]) => ({
      date,
      totalPledged: entry.total.toString(),
      contributionCount: entry.count,
    }));
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
    trafficSources: state.trafficSources ?? new Map(),
    conversions: state.conversions ?? new Map(),
  });
}

export type { CampaignRecord };
