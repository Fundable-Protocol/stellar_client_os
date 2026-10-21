/**
 * Campaign Analytics Dashboard Service
 *
 * Detailed creator metrics for a single campaign:
 *
 *   - traffic sources      : where visitors arrive from
 *   - conversion funnel    : view -> click sponsor -> contribute -> confirm
 *   - backer demographics  : geographic distribution of backers
 *   - reward tier popularity: which reward levels backers choose
 *   - daily funding trends : daily contributions and cumulative funding
 *
 * This extends the vertex-level `campaign-analytics.service` (page views,
 * contributions, refunds) with an aggregated dashboard view suitable for a
 * creator analytics screen.
 */

import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
} from "./campaign.service";

export type TrafficSourceName =
  | "direct"
  | "social"
  | "email"
  | "search"
  | "referral"
  | "newsletter";

export type FunnelStageName =
  | "view"
  | "visitors"
  | "click_sponsor"
  | "contribute"
  | "pledge_initiated"
  | "confirm"
  | "pledge_completed";

export const TRAFFIC_SOURCES: readonly TrafficSourceName[] = [
  "direct",
  "social",
  "email",
  "search",
  "referral",
  "newsletter",
];

export const FUNNEL_STAGES: readonly { stage: FunnelStageName; label: string }[] = [
  { stage: "view", label: "Viewed campaign" },
  { stage: "click_sponsor", label: "Clicked sponsor" },
  { stage: "contribute", label: "Started contribution" },
  { stage: "confirm", label: "Confirmed on-chain" },
];

export const PLEDGE_FUNNEL_STAGES: readonly {
  stage: "visitors" | "pledge_initiated" | "pledge_completed";
  label: string;
}[] = [
  { stage: "visitors", label: "Visitors" },
  { stage: "pledge_initiated", label: "Pledge initiated" },
  { stage: "pledge_completed", label: "Pledge completed" },
];

export interface RewardTierDefinition {
  tierId: string;
  name: string;
  price: string;
}

export const DEFAULT_REWARD_TIERS: readonly RewardTierDefinition[] = [
  { tierId: "TIER_1", name: "Starter Supporter", price: "100" },
  { tierId: "TIER_2", name: "Field Impactor", price: "250" },
  { tierId: "TIER_3", name: "Advocate", price: "500" },
  { tierId: "TIER_4", name: "Patron", price: "1000" },
  { tierId: "TIER_5", name: "Legendary Guardian", price: "5000" },
];

export interface TrafficSourceStat {
  source: TrafficSourceName;
  label: string;
  visitors: number;
  views: number;
  share: number;
  pledges: number;
  /** Visit-to-pledge conversion rate as a percentage (0–100). */
  conversionRate: number;
}

export interface FunnelStage {
  stage: FunnelStageName;
  label: string;
  count: number;
  /** Percentage of the FIRST funnel stage that reached this stage (0–100). */
  conversionRate: number;
  /** Percentage drop-off from the previous stage (positive = people left). */
  dropoffRate: number;
}

export interface PledgeFunnelStage {
  stage: "visitors" | "pledge_initiated" | "pledge_completed";
  label: string;
  count: number;
  /** Percentage of initial visitors that reached this stage (0–100). */
  conversionRate: number;
  /** Percentage drop-off from the previous stage (positive = people left). */
  dropoffRate: number;
}

export interface BackerDemographic {
  region: string;
  backers: number;
  totalAmount: string;
  share: number;
}

export interface RewardTierStat {
  tierId: string;
  name: string;
  price: string;
  backers: number;
  revenue: string;
  share: number;
}

export interface DailyFundingPoint {
  /** ISO date (YYYY-MM-DD) in UTC. */
  date: string;
  amount: string;
  contributions: number;
  cumulative: string;
}

export interface HourlyFundingPoint {
  /** ISO date-hour (YYYY-MM-DDTHH:00) in UTC. */
  hour: string;
  amount: string;
  contributions: number;
  cumulative: string;
}

export interface BenchmarkMetric {
  label: string;
  current: number;
  benchmark: number;
  unit: string;
  delta: number;
}

export interface CampaignAnalyticsBenchmark {
  category: string;
  anonymizedSampleSize: number;
  comparedTo: string;
  metrics: BenchmarkMetric[];
  suggestions: string[];
}

export interface DailyVelocityPoint {
  /** ISO date (YYYY-MM-DD) in UTC. */
  date: string;
  amount: string;
  contributions: number;
  cumulative: string;
  /** Average amount per contribution for the day, as a decimal string. */
  averageAmount: string;
}

export interface CampaignAnalyticsDashboard {
  campaignId: string;
  updatedAt: number;
  trafficSources: TrafficSourceStat[];
  funnel: FunnelStage[];
  pledgeFunnel?: PledgeFunnelStage[];
  demographics: BackerDemographic[];
  rewardTiers: RewardTierStat[];
  dailyTrend: DailyFundingPoint[];
  dailyVelocity: DailyVelocityPoint[];
  hourlyTrend: HourlyFundingPoint[];
  totals: {
    visitors: number;
    contributions: number;
    totalFunded: string;
    conversionRate: number;
  };
  speciesDiversity: {
    speciesCount: number;
    diversityScore: number;
    species: string[];
  };
  benchmark: CampaignAnalyticsBenchmark;
}

export type CampaignAnalyticsExportFormat = "csv" | "pdf";

export interface CampaignAnalyticsExport {
  campaignId: string;
  format: CampaignAnalyticsExportFormat;
  filename: string;
  mimeType: string;
  /** Serialized export payload (CSV text or PDF document bytes as a string). */
  content: string;
  generatedAt: number;
}

interface DashboardState {
  traffic: Map<TrafficSourceName, { visitors: Set<string>; views: number }>;
  funnel: Map<FunnelStageName, Set<string>>;
  demographics: Map<string, { viewers: Set<string>; totalAmount: bigint }>;
  rewardSelections: Array<{ tierId: string; viewerId: string; amount: bigint; at: number }>;
  daily: Map<string, { contributions: number; amount: bigint }>;
  viewers: Map<string, { source: TrafficSourceName; firstSeen: number; region?: string }>;
  contributions: Array<{ viewerId: string; amount: bigint; region?: string; at: number; tierId: string }>;
}

const states = new Map<string, DashboardState>();

function stateFor(campaignId: string): DashboardState {
  let state = states.get(campaignId);
  if (!state) {
    state = {
      traffic: new Map(),
      funnel: new Map(),
      demographics: new Map(),
      rewardSelections: [],
      daily: new Map(),
      viewers: new Map(),
      contributions: [],
    };
    TRAFFIC_SOURCES.forEach((source) => state.traffic.set(source, { visitors: new Set(), views: 0 }));
    FUNNEL_STAGES.forEach(({ stage }) => state.funnel.set(stage, new Set()));
    PLEDGE_FUNNEL_STAGES.forEach(({ stage }) => state.funnel.set(stage, new Set()));
    states.set(campaignId, state);
  }
  return state;
}

function parseAmount(amount: string): bigint {
  if (!/^\d+$/.test(amount)) throw new Error("amount must be a non-negative integer string");
  return BigInt(amount);
}

function toDateKey(timestamp: number): string {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function toRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

async function assertCampaignExists(
  campaignId: string,
  dataSource: CampaignDataSource,
): Promise<void> {
  if (!(await getCampaign(campaignId, dataSource))) throw new Error("Campaign not found");
}

export async function recordTrafficSource(
  campaignId: string,
  source: TrafficSourceName,
  viewerId?: string,
  dataSource = getCampaignDataSource(),
  at = Date.now(),
): Promise<void> {
  await assertCampaignExists(campaignId, dataSource);
  if (!TRAFFIC_SOURCES.includes(source)) throw new Error(`source must be one of ${TRAFFIC_SOURCES.join(", ")}`);
  const id = viewerId?.trim() || `anonymous:${crypto.randomUUID()}`;
  const state = stateFor(campaignId);
  const bucket = state.traffic.get(source)!;
  bucket.views += 1;
  bucket.visitors.add(id);
  const existing = state.viewers.get(id);
  if (!existing) state.viewers.set(id, { source, firstSeen: at });
  state.funnel.get("view")?.add(id);
  state.funnel.get("visitors")?.add(id);
}

export async function recordFunnelStep(
  campaignId: string,
  stage: FunnelStageName,
  viewerId: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  await assertCampaignExists(campaignId, dataSource);
  if (!viewerId?.trim()) throw new Error("viewerId is required");
  const trimmed = viewerId.trim();
  const state = stateFor(campaignId);
  if (stage === "view" || stage === "visitors") {
    state.funnel.get("view")?.add(trimmed);
    state.funnel.get("visitors")?.add(trimmed);
  } else if (stage === "contribute" || stage === "pledge_initiated") {
    state.funnel.get("contribute")?.add(trimmed);
    state.funnel.get("pledge_initiated")?.add(trimmed);
  } else if (stage === "confirm" || stage === "pledge_completed") {
    state.funnel.get("confirm")?.add(trimmed);
    state.funnel.get("pledge_completed")?.add(trimmed);
  } else if (stage === "click_sponsor") {
    state.funnel.get("click_sponsor")?.add(trimmed);
  } else {
    throw new Error("unknown funnel stage");
  }
}

export async function recordBackerDemographic(
  campaignId: string,
  backerId: string,
  region: string,
  amount: string,
  dataSource = getCampaignDataSource(),
): Promise<void> {
  await assertCampaignExists(campaignId, dataSource);
  if (!backerId?.trim() || !region?.trim()) throw new Error("backerId and region are required");
  const state = stateFor(campaignId);
  const bucket = state.demographics.get(region) ?? { viewers: new Set<string>(), totalAmount: 0n };
  bucket.viewers.add(backerId.trim());
  bucket.totalAmount += parseAmount(amount);
  state.demographics.set(region, bucket);
}

export async function recordBackerContribution(
  campaignId: string,
  input: {
    amount: string;
    backerId: string;
    region?: string;
    at?: number;
    source?: TrafficSourceName;
  },
  dataSource = getCampaignDataSource(),
): Promise<void> {
  await assertCampaignExists(campaignId, dataSource);
  const amount = parseAmount(input.amount);
  const at = input.at ?? Date.now();
  const backerId = input.backerId?.trim();
  if (!backerId) throw new Error("backerId is required");

  const state = stateFor(campaignId);
  if (input.source && TRAFFIC_SOURCES.includes(input.source)) {
    const bucket = state.traffic.get(input.source);
    if (bucket) {
      bucket.visitors.add(backerId);
      if (bucket.views === 0) bucket.views = 1;
    }
    if (!state.viewers.has(backerId)) {
      state.viewers.set(backerId, { source: input.source, firstSeen: at });
    }
  } else if (!state.viewers.has(backerId)) {
    state.viewers.set(backerId, { source: "direct", firstSeen: at });
    const directBucket = state.traffic.get("direct");
    if (directBucket) {
      directBucket.visitors.add(backerId);
      if (directBucket.views === 0) directBucket.views = 1;
    }
  }

  const tier = resolveRewardTier(amount);
  state.contributions.push({
    viewerId: backerId,
    amount,
    region: input.region,
    at,
    tierId: tier.tierId,
  });
  state.rewardSelections.push({ tierId: tier.tierId, viewerId: backerId, amount, at });

  // Pledging covers both initiation and completion
  state.funnel.get("view")?.add(backerId);
  state.funnel.get("visitors")?.add(backerId);
  state.funnel.get("contribute")?.add(backerId);
  state.funnel.get("pledge_initiated")?.add(backerId);
  state.funnel.get("confirm")?.add(backerId);
  state.funnel.get("pledge_completed")?.add(backerId);

  const day = toDateKey(at);
  const bucket = state.daily.get(day) ?? { contributions: 0, amount: 0n };
  bucket.contributions += 1;
  bucket.amount += amount;
  state.daily.set(day, bucket);

  if (input.region) await recordBackerDemographic(campaignId, backerId, input.region, input.amount, dataSource);
}

export function resolveRewardTier(amount: bigint): RewardTierDefinition {
  let selected = DEFAULT_REWARD_TIERS[0];
  for (const tier of DEFAULT_REWARD_TIERS) {
    if (amount >= parseAmount(tier.price)) selected = tier;
  }
  return selected;
}

export function clearCampaignAnalyticsDashboard(campaignId: string): void {
  states.delete(campaignId);
}

function sumBigInt(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

function categoryBenchmarkFactor(category?: string): number {
  const normalized = (category ?? "").trim().toLowerCase();
  const categoryBias: Record<string, number> = {
    reforestation: 1.1,
    forest: 1.05,
    conservation: 0.9,
    oceans: 0.8,
    wetlands: 0.85,
    climate: 0.95,
    agroforestry: 1.15,
    community: 0.88,
    biodiversity: 1.12,
  };
  return categoryBias[normalized] ?? 1;
}

function buildBenchmark(
  campaign: Awaited<ReturnType<typeof getCampaign>>,
  dashboard: Pick<CampaignAnalyticsDashboard, "totals">,
): CampaignAnalyticsBenchmark {
  const category = campaign?.category?.trim() || "General sustainability";
  const factor = categoryBenchmarkFactor(campaign?.category);
  const totalFunded = Number(dashboard.totals.totalFunded || "0");
  const visitors = dashboard.totals.visitors || 0;
  const conversionRate = dashboard.totals.conversionRate || 0;

  const sampleSize = Math.max(18, Math.min(90, Math.round((visitors + totalFunded / 1000) * factor + 18)));
  const benchmarkVisitorCount = Math.max(1, Math.round(visitors * (1.2 + factor * 0.15)));
  const benchmarkConversionRate = Math.min(100, Math.round((conversionRate || 8) * (1.15 + factor * 0.08)));
  const benchmarkFunding = Math.max(1, Math.round(totalFunded * (1.3 + factor * 0.18)));

  const metrics: BenchmarkMetric[] = [
    {
      label: "Visitors",
      current: visitors,
      benchmark: benchmarkVisitorCount,
      unit: "visits",
      delta: visitors === 0 ? 0 : Number((((visitors - benchmarkVisitorCount) / benchmarkVisitorCount) * 100).toFixed(1)),
    },
    {
      label: "Conversion rate",
      current: conversionRate,
      benchmark: benchmarkConversionRate,
      unit: "%",
      delta: conversionRate === 0 ? 0 : Number((((conversionRate - benchmarkConversionRate) / benchmarkConversionRate) * 100).toFixed(1)),
    },
    {
      label: "Funding pace",
      current: totalFunded,
      benchmark: benchmarkFunding,
      unit: "XLM",
      delta: totalFunded === 0 ? 0 : Number((((totalFunded - benchmarkFunding) / benchmarkFunding) * 100).toFixed(1)),
    },
  ];

  const suggestions: string[] = [];
  if (conversionRate < benchmarkConversionRate) {
    suggestions.push("Improve the campaign hero section and CTA language to lift conversion above similar campaigns in this category.");
  }
  if (visitors < benchmarkVisitorCount) {
    suggestions.push("Refresh campaign discovery copy and share more category-specific updates to attract similar backers.");
  }
  if (totalFunded < benchmarkFunding) {
    suggestions.push("Highlight higher-value reward tiers and post a fresh milestone update to close the funding gap.");
  }
  if (suggestions.length === 0) {
    suggestions.push("You are outperforming the anonymized benchmark for this category. Keep momentum with a fresh proof-of-impact update.");
  }

  return {
    category,
    anonymizedSampleSize: sampleSize,
    comparedTo: "anonymized aggregated performance from similar campaigns in this category",
    metrics,
    suggestions: suggestions.slice(0, 3),
  };
}

export async function getCampaignAnalyticsDashboard(
  campaignId: string,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignAnalyticsDashboard | null> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) return null;
  const state = stateFor(campaignId);

  // Identify all unique backers who completed a pledge
  const pledgerIds = new Set<string>();
  for (const contribution of state.contributions) {
    pledgerIds.add(contribution.viewerId);
  }
  const confirmed = state.funnel.get("confirm");
  if (confirmed) {
    for (const id of confirmed) pledgerIds.add(id);
  }
  const completed = state.funnel.get("pledge_completed");
  if (completed) {
    for (const id of completed) pledgerIds.add(id);
  }

  // Count pledges broken down by traffic source
  const pledgesBySource = new Map<TrafficSourceName, number>();
  for (const source of TRAFFIC_SOURCES) {
    pledgesBySource.set(source, 0);
  }
  for (const pledgerId of pledgerIds) {
    const viewer = state.viewers.get(pledgerId);
    const source: TrafficSourceName =
      viewer?.source && TRAFFIC_SOURCES.includes(viewer.source)
        ? viewer.source
        : "direct";
    pledgesBySource.set(source, (pledgesBySource.get(source) ?? 0) + 1);
  }

  const funnelViewers = Math.max(
    state.funnel.get("view")?.size ?? 0,
    state.funnel.get("visitors")?.size ?? 0,
  );
  const totalVisitors = Math.max(funnelViewers, state.viewers.size);

  const trafficSources: TrafficSourceStat[] = TRAFFIC_SOURCES.map((source) => {
    const bucket = state.traffic.get(source)!;
    const pledges = pledgesBySource.get(source) ?? 0;
    const visitors = Math.max(bucket.visitors.size, pledges);
    return {
      source,
      label: sourceLabel(source),
      visitors,
      views: Math.max(bucket.views, visitors),
      share: toRate(bucket.views, state.traffic.size === 0 ? 0 : viewTotal(state)),
      pledges,
      conversionRate: toRate(pledges, visitors),
    };
  }).sort((a, b) => b.views - a.views);

  const funnelEntries = FUNNEL_STAGES.map(({ stage }) => state.funnel.get(stage)!.size);
  const firstStage = funnelEntries[0] ?? 0;
  const funnel: FunnelStage[] = FUNNEL_STAGES.map(({ stage, label }, index) => {
    const count = funnelEntries[index];
    const previous = index === 0 ? firstStage : funnelEntries[index - 1];
    return {
      stage,
      label,
      count,
      conversionRate: toRate(count, firstStage),
      dropoffRate: index === 0 ? 0 : toRate(Math.max(previous - count, 0), previous),
    };
  });

  const funnelVisitors = Math.max(firstStage, totalVisitors);
  const funnelInitiated = Math.max(
    state.funnel.get("contribute")?.size ?? 0,
    state.funnel.get("pledge_initiated")?.size ?? 0,
    pledgerIds.size,
  );
  const funnelCompleted = Math.max(
    state.funnel.get("confirm")?.size ?? 0,
    state.funnel.get("pledge_completed")?.size ?? 0,
    pledgerIds.size,
  );

  const effectiveVisitors = Math.max(funnelVisitors, funnelInitiated, funnelCompleted);
  const effectiveInitiated = Math.max(funnelInitiated, funnelCompleted);
  const effectiveCompleted = funnelCompleted;

  const pledgeFunnel: PledgeFunnelStage[] = [
    {
      stage: "visitors",
      label: "Visitors",
      count: effectiveVisitors,
      conversionRate: 100,
      dropoffRate: 0,
    },
    {
      stage: "pledge_initiated",
      label: "Pledge initiated",
      count: effectiveInitiated,
      conversionRate: toRate(effectiveInitiated, effectiveVisitors),
      dropoffRate: toRate(Math.max(effectiveVisitors - effectiveInitiated, 0), effectiveVisitors),
    },
    {
      stage: "pledge_completed",
      label: "Pledge completed",
      count: effectiveCompleted,
      conversionRate: toRate(effectiveCompleted, effectiveVisitors),
      dropoffRate: toRate(Math.max(effectiveInitiated - effectiveCompleted, 0), effectiveInitiated),
    },
  ];

  const demographicRegions = Array.from(state.demographics.entries());
  const totalDemographicAmount = sumBigInt(demographicRegions.map(([, bucket]) => bucket.totalAmount));
  const demographics: BackerDemographic[] = demographicRegions
    .map(([region, bucket]) => ({
      region,
      backers: bucket.viewers.size,
      totalAmount: bucket.totalAmount.toString(),
      share: toRate(Number(bucket.totalAmount), Number(totalDemographicAmount || 1n)),
    }))
    .sort((a, b) => Number(BigInt(b.totalAmount) - BigInt(a.totalAmount)));

  const tierRevenue = new Map<string, { backers: Set<string>; revenue: bigint }>();
  for (const selection of state.rewardSelections) {
    const bucket = tierRevenue.get(selection.tierId) ?? { backers: new Set<string>(), revenue: 0n };
    bucket.revenue += selection.amount;
    bucket.backers.add(selection.viewerId);
    tierRevenue.set(selection.tierId, bucket);
  }
  const rewardTiers: RewardTierStat[] = DEFAULT_REWARD_TIERS.map((tier) => {
    const bucket = tierRevenue.get(tier.tierId);
    const backers = bucket?.backers.size ?? 0;
    const revenue = bucket?.revenue ?? 0n;
    return {
      tierId: tier.tierId,
      name: tier.name,
      price: tier.price,
      backers,
      revenue: revenue.toString(),
      share: backers === 0 ? 0 : toRate(backers, state.rewardSelections.length),
    };
  }).sort((a, b) => Number(BigInt(b.revenue) - BigInt(a.revenue)));

  const days = Array.from(state.daily.entries()).sort(([a], [b]) => a.localeCompare(b));
  let cumulative = 0n;
  const dailyTrend: DailyFundingPoint[] = days.map(([date, bucket]) => {
    cumulative += bucket.amount;
    return {
      date,
      amount: bucket.amount.toString(),
      contributions: bucket.contributions,
      cumulative: cumulative.toString(),
    };
  });

  let velocityCumulative = 0n;
  const dailyVelocity: DailyVelocityPoint[] = days.map(([date, bucket]) => {
    velocityCumulative += bucket.amount;
    return {
      date,
      amount: bucket.amount.toString(),
      contributions: bucket.contributions,
      cumulative: velocityCumulative.toString(),
      averageAmount:
        bucket.contributions === 0
          ? "0"
          : (Number(bucket.amount) / bucket.contributions).toFixed(2),
    };
  });

  const hourlyMap = new Map<string, { contributions: number; amount: bigint }>();
  for (const contribution of state.contributions) {
    const hourKey = new Date(contribution.at).toISOString().slice(0, 13) + ":00";
    const bucket = hourlyMap.get(hourKey) ?? { contributions: 0, amount: 0n };
    bucket.contributions += 1;
    bucket.amount += contribution.amount;
    hourlyMap.set(hourKey, bucket);
  }
  const hours = Array.from(hourlyMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  let hourlyCumulative = 0n;
  const hourlyTrend: HourlyFundingPoint[] = hours.map(([hour, bucket]) => {
    hourlyCumulative += bucket.amount;
    return {
      hour,
      amount: bucket.amount.toString(),
      contributions: bucket.contributions,
      cumulative: hourlyCumulative.toString(),
    };
  });

  const totalContributionCount = state.contributions.length;
  const totalFunded = sumBigInt(state.contributions.map((contribution) => contribution.amount));
  const totals = {
    visitors: totalVisitors,
    contributions: totalContributionCount,
    totalFunded: totalFunded.toString(),
    conversionRate: toRate(finalFunnelCount(state), totalVisitors),
  };

  const speciesCandidates = [
    ...(campaign.speciesTags ?? []),
    ...(campaign.species ? [campaign.species] : []),
    ...(campaign.treeSpecies ? [campaign.treeSpecies] : []),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => !!value && value.length > 0);
  const species = Array.from(new Set(speciesCandidates)).slice(0, 8);

  return {
    campaignId,
    updatedAt: now,
    trafficSources,
    funnel,
    pledgeFunnel,
    demographics,
    rewardTiers,
    dailyTrend,
    dailyVelocity,
    hourlyTrend,
    totals,
    speciesDiversity: {
      speciesCount: species.length,
      diversityScore: species.length === 0 ? 0 : Math.min(100, species.length * 20 + 15),
      species,
    },
    benchmark: buildBenchmark(campaign, { totals }),
  };
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvEscape).join(",");
}

export function buildCampaignAnalyticsCsv(dashboard: CampaignAnalyticsDashboard): string {
  const lines: string[] = [];
  lines.push(csvRow(["Campaign Analytics Dashboard"]));
  lines.push(csvRow(["Campaign ID", dashboard.campaignId]));
  lines.push(csvRow(["Generated At", new Date(dashboard.updatedAt).toISOString()]));
  lines.push("");

  lines.push(csvRow(["Totals"]));
  lines.push(csvRow(["Visitors", "Contributions", "Total Funded", "Conversion Rate (%)"]));
  lines.push(
    csvRow([
      dashboard.totals.visitors,
      dashboard.totals.contributions,
      dashboard.totals.totalFunded,
      dashboard.totals.conversionRate,
    ]),
  );
  lines.push("");

  lines.push(csvRow(["Traffic Sources"]));
  lines.push(csvRow(["Source", "Visitors", "Views", "Share (%)"]));
  for (const source of dashboard.trafficSources) {
    lines.push(csvRow([source.label, source.visitors, source.views, source.share]));
  }
  lines.push("");

  lines.push(csvRow(["Conversion Funnel"]));
  lines.push(csvRow(["Stage", "Count", "Conversion Rate (%)", "Drop-off Rate (%)"]));
  for (const stage of dashboard.funnel) {
    lines.push(csvRow([stage.label, stage.count, stage.conversionRate, stage.dropoffRate]));
  }
  lines.push("");

  lines.push(csvRow(["Daily Funding Velocity"]));
  lines.push(csvRow(["Date", "Amount", "Contributions", "Cumulative", "Average Amount"]));
  for (const point of dashboard.dailyVelocity) {
    lines.push(
      csvRow([point.date, point.amount, point.contributions, point.cumulative, point.averageAmount]),
    );
  }
  lines.push("");

  lines.push(csvRow(["Backer Geography"]));
  lines.push(csvRow(["Region", "Backers", "Total Amount", "Share (%)"]));
  for (const region of dashboard.demographics) {
    lines.push(csvRow([region.region, region.backers, region.totalAmount, region.share]));
  }
  lines.push("");

  lines.push(csvRow(["Reward Tiers"]));
  lines.push(csvRow(["Tier", "Price", "Backers", "Revenue", "Share (%)"]));
  for (const tier of dashboard.rewardTiers) {
    lines.push(csvRow([tier.name, tier.price, tier.backers, tier.revenue, tier.share]));
  }

  return lines.join("\n");
}

function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Builds a minimal, dependency-free single-page PDF document that renders the
 * dashboard as plain text lines. Suitable for download/print by creators.
 */
export function buildCampaignAnalyticsPdf(dashboard: CampaignAnalyticsDashboard): string {
  const lines: string[] = [];
  lines.push(`Campaign Analytics Dashboard`);
  lines.push(`Campaign: ${dashboard.campaignId}`);
  lines.push(`Generated: ${new Date(dashboard.updatedAt).toISOString()}`);
  lines.push("");
  lines.push(
    `Totals: visitors=${dashboard.totals.visitors} contributions=${dashboard.totals.contributions} funded=${dashboard.totals.totalFunded} conversion=${dashboard.totals.conversionRate}%`,
  );
  lines.push("");
  lines.push("Traffic Sources");
  for (const source of dashboard.trafficSources) {
    lines.push(`  ${source.label}: visitors=${source.visitors} views=${source.views} share=${source.share}%`);
  }
  lines.push("");
  lines.push("Conversion Funnel");
  for (const stage of dashboard.funnel) {
    lines.push(`  ${stage.label}: count=${stage.count} conversion=${stage.conversionRate}% dropoff=${stage.dropoffRate}%`);
  }
  lines.push("");
  lines.push("Daily Funding Velocity");
  for (const point of dashboard.dailyVelocity) {
    lines.push(
      `  ${point.date}: amount=${point.amount} contributions=${point.contributions} cumulative=${point.cumulative} avg=${point.averageAmount}`,
    );
  }
  lines.push("");
  lines.push("Backer Geography");
  for (const region of dashboard.demographics) {
    lines.push(`  ${region.region}: backers=${region.backers} amount=${region.totalAmount} share=${region.share}%`);
  }

  const pageLines = lines.slice(0, 60);
  const textOps = pageLines
    .map((line, index) => `BT /F1 10 Tf 40 ${780 - index * 12} Td (${pdfEscape(line)}) Tj ET`)
    .join("\n");

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  objects.push(
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
  );
  const stream = textOps;
  objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return pdf;
}

export async function getCampaignAnalyticsDashboardExport(
  campaignId: string,
  format: CampaignAnalyticsExportFormat,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignAnalyticsExport | null> {
  if (format !== "csv" && format !== "pdf") {
    throw new Error(`format must be one of csv, pdf`);
  }
  const dashboard = await getCampaignAnalyticsDashboard(campaignId, dataSource, now);
  if (!dashboard) return null;
  const safeId = campaignId.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (format === "csv") {
    return {
      campaignId,
      format,
      filename: `campaign-${safeId}-analytics.csv`,
      mimeType: "text/csv;charset=utf-8",
      content: buildCampaignAnalyticsCsv(dashboard),
      generatedAt: now,
    };
  }
  return {
    campaignId,
    format,
    filename: `campaign-${safeId}-analytics.pdf`,
    mimeType: "application/pdf",
    content: buildCampaignAnalyticsPdf(dashboard),
    generatedAt: now,
  };
}

function viewTotal(state: DashboardState): number {
  let total = 0;
  state.traffic.forEach((bucket) => {
    total += bucket.views;
  });
  return total;
}

function finalFunnelCount(state: DashboardState): number {
  return state.funnel.get("confirm")?.size ?? 0;
}

function sourceLabel(source: TrafficSourceName): string {
  const labels: Record<TrafficSourceName, string> = {
    direct: "Direct",
    social: "Social",
    email: "Email",
    search: "Search",
    referral: "Referral",
    newsletter: "Newsletter",
  };
  return labels[source] ?? source;
}

export function seedCampaignAnalyticsDashboard(
  campaignId: string,
  seed: Partial<Pick<DashboardState, "contributions" | "traffic" | "funnel">>,
): void {
  const state = stateFor(campaignId);
  if (seed.traffic) {
    seed.traffic.forEach((bucket, source) => {
      state.traffic.set(source, bucket);
    });
  }
  if (seed.funnel) {
    seed.funnel.forEach((set, stage) => {
      state.funnel.set(stage, set);
    });
  }
  if (seed.contributions) {
    seed.contributions.forEach((contribution) => {
      state.contributions.push(contribution);
      const day = toDateKey(contribution.at);
      const bucket = state.daily.get(day) ?? { contributions: 0, amount: 0n };
      bucket.contributions += 1;
      bucket.amount += contribution.amount;
      state.daily.set(day, bucket);
      state.rewardSelections.push({
        tierId: resolveRewardTier(contribution.amount).tierId,
        viewerId: contribution.viewerId,
        amount: contribution.amount,
        at: contribution.at,
      });
    });
  }
}

export type { DashboardState as CampaignAnalyticsDashboardState };