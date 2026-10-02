/**
 * Admin campaign analytics — real-time platform metrics (issue #928)
 *
 * Platform-wide numbers for the admin dashboard: active campaigns, total trees
 * planted, total CO2 sequestered, sponsor growth, campaign completion rate, and
 * revenue.
 *
 * Campaign-level figures (trees, CO2) come from the same `CampaignImpactRecord`
 * and metric helpers as the public impact leaderboard, so the admin totals are
 * always the sum of what the leaderboard shows per campaign. Sponsor growth and
 * windowed revenue need a timeline, which the per-campaign records do not have,
 * so they are computed from sponsorship events.
 *
 * Every figure is a pure function of the records, the events, and `now`, so the
 * snapshot is deterministic and testable without a network; "real-time" comes
 * from recomputing it on every request (and on every tick of the SSE stream).
 */

import {
  computeCampaignImpactMetrics,
  demoImpactCampaigns,
  type CampaignImpactRecord,
} from "@/services/campaign-impact-leaderboard.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const DAY_SECONDS = 86_400;
const STROOPS_PER_XLM = 10_000_000n;

export const DEFAULT_ANALYTICS_WINDOW_DAYS = 30;
export const MAX_ANALYTICS_WINDOW_DAYS = 365;

/** One sponsor funding one campaign. */
export interface SponsorshipEvent {
  campaignId: string;
  sponsorAddress: string;
  /** Amount in stroops (decimal string). */
  amount: string;
  /** Unix seconds. */
  at: number;
}

export interface AdminAnalyticsDataSource {
  getCampaigns(network: string): Promise<CampaignImpactRecord[]>;
  getSponsorships(network: string): Promise<SponsorshipEvent[]>;
}

export interface SponsorGrowthPoint {
  /** UTC calendar day, `YYYY-MM-DD`. */
  date: string;
  newSponsors: number;
  /** Distinct sponsors seen up to and including this day. */
  totalSponsors: number;
}

export interface AdminCampaignAnalytics {
  campaigns: {
    total: number;
    active: number;
    successful: number;
    claimed: number;
    failed: number;
  };
  trees: { planted: number };
  co2: {
    /** Annual uptake of everything planted, at the base per-species rate. */
    sequesteredPerYearKg: number;
    sequesteredPerYearTonnes: number;
    projectedOver10YearsTonnes: number;
  };
  sponsors: {
    /** Distinct sponsor addresses across every campaign. */
    total: number;
    newInWindow: number;
    newInPreviousWindow: number;
    /** Change against the previous window, e.g. 0.25 for +25%; `null` when there is no baseline. */
    growthRate: number | null;
    daily: SponsorGrowthPoint[];
  };
  completion: {
    /** Campaigns that finished funding either way (successful, claimed, or failed). */
    ended: number;
    /** Campaigns that reached their goal (successful or claimed). */
    completed: number;
    /** completed / ended; `null` before any campaign has ended. */
    rate: number | null;
  };
  revenue: {
    /** Raised across all campaigns, in stroops (decimal string — exact). */
    totalStroops: string;
    totalXlm: number;
    inWindowXlm: number;
    previousWindowXlm: number;
    growthRate: number | null;
  };
  window: {
    days: number;
    /** Unix seconds, inclusive. */
    start: number;
    /** Unix seconds, exclusive. */
    end: number;
  };
  network: string;
  generatedAt: number;
}

export interface AdminAnalyticsQuery {
  network?: string;
  windowDays?: number;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function toStroops(value: string): bigint {
  // Amounts are stroop integers; anything else (garbage, negatives, decimals)
  // contributes nothing rather than throwing on one bad record.
  return /^\d+$/.test(value.trim()) ? BigInt(value.trim()) : 0n;
}

/** Stroops to XLM as a number, exact to the stroop for any realistic total. */
export function stroopsToXlm(stroops: bigint): number {
  const whole = stroops / STROOPS_PER_XLM;
  const fraction = stroops % STROOPS_PER_XLM;
  return Number(whole) + Number(fraction) / Number(STROOPS_PER_XLM);
}

function growthRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10_000) / 10_000;
}

const utcDate = (unixSeconds: number) => new Date(unixSeconds * 1000).toISOString().slice(0, 10);

/** Clamp a requested window to 1…{@link MAX_ANALYTICS_WINDOW_DAYS} whole days. */
export function normalizeWindowDays(days: number | undefined): number {
  if (days === undefined || !Number.isFinite(days)) return DEFAULT_ANALYTICS_WINDOW_DAYS;
  return Math.min(Math.max(Math.floor(days), 1), MAX_ANALYTICS_WINDOW_DAYS);
}

/**
 * Compute the admin snapshot.
 *
 * @param now - Unix seconds the window ends at (exclusive).
 */
export function computeAdminCampaignAnalytics(
  campaigns: readonly CampaignImpactRecord[],
  sponsorships: readonly SponsorshipEvent[],
  options: { now: number; windowDays?: number; network?: string },
): AdminCampaignAnalytics {
  const windowDays = normalizeWindowDays(options.windowDays);
  const end = Math.floor(options.now);
  const start = end - windowDays * DAY_SECONDS;
  const previousStart = start - windowDays * DAY_SECONDS;

  // Campaigns, trees, CO2, completion, total revenue.
  const status = { active: 0, successful: 0, claimed: 0, failed: 0 };
  let trees = 0;
  let co2PerYearKg = 0;
  let totalStroops = 0n;
  for (const campaign of campaigns) {
    if (campaign.status === "Active") status.active += 1;
    else if (campaign.status === "Successful") status.successful += 1;
    else if (campaign.status === "Claimed") status.claimed += 1;
    else if (campaign.status === "Failed") status.failed += 1;

    const metrics = computeCampaignImpactMetrics(campaign);
    trees += metrics.trees;
    co2PerYearKg += metrics.co2PerYearKg;
    totalStroops += toStroops(campaign.totalRaised);
  }
  const completed = status.successful + status.claimed;
  const ended = completed + status.failed;

  // Sponsor growth and windowed revenue, from events that are not in the future.
  const firstSeen = new Map<string, number>();
  let inWindowStroops = 0n;
  let previousWindowStroops = 0n;
  for (const event of sponsorships) {
    if (!Number.isFinite(event.at) || event.at >= end || !event.sponsorAddress) continue;
    const seen = firstSeen.get(event.sponsorAddress);
    if (seen === undefined || event.at < seen) firstSeen.set(event.sponsorAddress, event.at);

    const amount = toStroops(event.amount);
    if (event.at >= start) inWindowStroops += amount;
    else if (event.at >= previousStart) previousWindowStroops += amount;
  }

  const firstTimes = [...firstSeen.values()];
  const newInWindow = firstTimes.filter((at) => at >= start).length;
  const newInPreviousWindow = firstTimes.filter((at) => at >= previousStart && at < start).length;

  const daily: SponsorGrowthPoint[] = [];
  let runningTotal = firstTimes.length - newInWindow;
  for (let day = 0; day < windowDays; day += 1) {
    const dayStart = start + day * DAY_SECONDS;
    const dayEnd = dayStart + DAY_SECONDS;
    const newSponsors = firstTimes.filter((at) => at >= dayStart && at < dayEnd).length;
    runningTotal += newSponsors;
    daily.push({ date: utcDate(dayStart), newSponsors, totalSponsors: runningTotal });
  }

  const inWindowXlm = stroopsToXlm(inWindowStroops);
  const previousWindowXlm = stroopsToXlm(previousWindowStroops);

  return {
    campaigns: { total: campaigns.length, ...status },
    trees: { planted: trees },
    co2: {
      sequesteredPerYearKg: co2PerYearKg,
      sequesteredPerYearTonnes: co2PerYearKg / 1000,
      projectedOver10YearsTonnes: (co2PerYearKg * 10) / 1000,
    },
    sponsors: {
      total: firstTimes.length,
      newInWindow,
      newInPreviousWindow,
      growthRate: growthRate(newInWindow, newInPreviousWindow),
      daily,
    },
    completion: {
      ended,
      completed,
      rate: ended === 0 ? null : Math.round((completed / ended) * 10_000) / 10_000,
    },
    revenue: {
      totalStroops: totalStroops.toString(),
      totalXlm: stroopsToXlm(totalStroops),
      inWindowXlm,
      previousWindowXlm,
      growthRate: growthRate(inWindowXlm, previousWindowXlm),
    },
    window: { days: windowDays, start, end },
    network: options.network ?? "testnet",
    generatedAt: end,
  };
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

/**
 * Deterministic demo sponsorships for the leaderboard's demo campaigns: each
 * campaign's sponsors fund it evenly between its creation and completion (or
 * `now`), drawing from a shared pool of addresses so some sponsors back more
 * than one campaign, as they do in practice.
 */
export function demoSponsorships(
  campaigns: readonly CampaignImpactRecord[],
  now: number,
): SponsorshipEvent[] {
  const events: SponsorshipEvent[] = [];
  campaigns.forEach((campaign, campaignIndex) => {
    const count = Math.max(0, Math.floor(campaign.sponsorCount));
    if (count === 0) return;
    const until = campaign.completedAt ?? now;
    const span = Math.max(1, until - campaign.createdAt);
    const amount = (toStroops(campaign.totalRaised) / BigInt(count)).toString();
    for (let k = 0; k < count; k += 1) {
      const sponsor = (campaignIndex * 37 + k) % 600;
      events.push({
        campaignId: campaign.id,
        sponsorAddress: `GDEMOSPONSOR${String(sponsor).padStart(44, "0")}`,
        amount,
        at: campaign.createdAt + Math.floor((span * k) / count),
      });
    }
  });
  return events;
}

/**
 * Default source. Serves the demo campaigns and sponsorships until the
 * `campaign-funding` indexer is wired in, and nothing under test.
 */
export class DefaultAdminAnalyticsDataSource implements AdminAnalyticsDataSource {
  async getCampaigns(): Promise<CampaignImpactRecord[]> {
    if (process.env.NODE_ENV === "test") return [];
    return demoImpactCampaigns();
  }

  async getSponsorships(): Promise<SponsorshipEvent[]> {
    return demoSponsorships(await this.getCampaigns(), Math.floor(Date.now() / 1000));
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class AdminCampaignAnalyticsService {
  private readonly dataSource: AdminAnalyticsDataSource;
  private readonly clock: () => number;

  constructor(
    options: { dataSource?: AdminAnalyticsDataSource; clock?: () => number } = {},
  ) {
    this.dataSource = options.dataSource ?? new DefaultAdminAnalyticsDataSource();
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  }

  async getSnapshot(query: AdminAnalyticsQuery = {}): Promise<AdminCampaignAnalytics> {
    const network = query.network ?? "testnet";
    const [campaigns, sponsorships] = await Promise.all([
      this.dataSource.getCampaigns(network),
      this.dataSource.getSponsorships(network),
    ]);
    return computeAdminCampaignAnalytics(campaigns, sponsorships, {
      now: this.clock(),
      windowDays: query.windowDays,
      network,
    });
  }
}

let _defaultService: AdminCampaignAnalyticsService | null = null;

export function getAdminCampaignAnalyticsService(): AdminCampaignAnalyticsService {
  if (!_defaultService) _defaultService = new AdminCampaignAnalyticsService();
  return _defaultService;
}

/** Replace the process-wide service; used by route tests to inject fixtures. */
export function setAdminCampaignAnalyticsService(
  service: AdminCampaignAnalyticsService | null,
): void {
  _defaultService = service;
}
