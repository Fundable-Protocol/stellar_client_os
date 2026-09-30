/**
 * Campaign comparison — side-by-side details (issue #929)
 *
 * Lets a sponsor put up to three tree-planting campaigns next to each other and
 * compare what matters when choosing where to sponsor: tree species, planting
 * location, completion rate, CO2 impact, sponsor count, and cost per tree.
 *
 * Every figure is derived from the same campaign record the impact leaderboard
 * ranks (`CampaignImpactRecord`), through the same metric helpers, so a
 * campaign's trees, CO2 and sponsor numbers here always agree with its
 * leaderboard entry. CO2 uses the base annual per-species rate for the same
 * reason the leaderboard does: the rainy-season bonus is a projection for one
 * planting decision, and applying it would make the comparison depend on the
 * month it was read.
 */

import { getTreeSpecies } from "@/lib/co2-impact";
import {
  computeCampaignImpactMetrics,
  demoImpactCampaigns,
  type CampaignImpactRecord,
  type ImpactCampaignStatus,
} from "@/services/campaign-impact-leaderboard.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Most campaigns a sponsor can compare at once. */
export const MAX_COMPARED_CAMPAIGNS = 3;

/** Stroops per XLM — amounts on the record are stroops, costs are shown in XLM. */
const STROOPS_PER_XLM = 10_000_000;

/** Campaign ids are on-chain numeric ids or slug-like fixture ids. */
const CAMPAIGN_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export interface CampaignLocation {
  country: string;
  region: string;
}

/** A campaign as indexed for comparison: the impact record plus where it plants. */
export interface ComparisonCampaignRecord extends CampaignImpactRecord {
  location: CampaignLocation;
}

export interface ComparedSpecies {
  id: string;
  label: string;
  trees: number;
  /** Share of the campaign's trees, in [0, 1]. */
  share: number;
}

/** One column of the comparison. */
export interface CampaignComparisonColumn {
  campaignId: string;
  title: string;
  status: ImpactCampaignStatus;
  location: CampaignLocation & { label: string };
  /** Species planted, most-planted first. */
  species: ComparedSpecies[];
  trees: number;
  /** Raised / target, in [0, 1]. */
  completionRate: number;
  co2: {
    perYearKg: number;
    perYearTonnes: number;
    over10YearsTonnes: number;
  };
  sponsorCount: number;
  raisedXlm: number;
  /** Raised XLM per tree planted; `null` until the campaign has planted a tree. */
  costPerTreeXlm: number | null;
}

/** The metrics a column can lead on. */
export const COMPARISON_METRICS = ["completionRate", "co2", "sponsorCount", "costPerTree"] as const;

export type ComparisonMetric = (typeof COMPARISON_METRICS)[number];

export interface CampaignComparison {
  campaigns: CampaignComparisonColumn[];
  /**
   * Ids of the campaigns that lead each metric (several on a tie). Empty when
   * fewer than two campaigns are compared, or nobody has a value to lead with.
   * `costPerTree` is led by the *lowest* cost.
   */
  leaders: Record<ComparisonMetric, string[]>;
  /** Requested ids that do not match a campaign. */
  missing: string[];
}

/** A campaign a sponsor can pick for comparison. */
export interface ComparisonOption {
  campaignId: string;
  title: string;
  status: ImpactCampaignStatus;
  location: string;
}

/** Thrown for a comparison request that cannot be answered; the route maps it to a 400. */
export class CampaignComparisonError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignComparisonError";
  }
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function stroopsToXlm(stroops: string): number {
  const value = Number(stroops);
  return Number.isFinite(value) && value > 0 ? value / STROOPS_PER_XLM : 0;
}

/**
 * Parse the `ids` query value: comma-separated, trimmed, deduplicated in
 * order. Rejects more than {@link MAX_COMPARED_CAMPAIGNS} ids or an id that
 * could not be a campaign id.
 */
export function parseComparisonIds(raw: string | null | undefined): string[] {
  if (raw === null || raw === undefined) return [];
  const ids = [...new Set(raw.split(",").map((id) => id.trim()).filter((id) => id.length > 0))];
  const invalid = ids.find((id) => !CAMPAIGN_ID_PATTERN.test(id));
  if (invalid !== undefined) {
    throw new CampaignComparisonError(`"${invalid.slice(0, 64)}" is not a valid campaign id`);
  }
  if (ids.length > MAX_COMPARED_CAMPAIGNS) {
    throw new CampaignComparisonError(
      `At most ${MAX_COMPARED_CAMPAIGNS} campaigns can be compared at once`,
    );
  }
  return ids;
}

/** Build one comparison column from a campaign record. */
export function buildComparisonColumn(record: ComparisonCampaignRecord): CampaignComparisonColumn {
  const metrics = computeCampaignImpactMetrics(record);
  const raisedXlm = stroopsToXlm(record.totalRaised);

  const species = metrics.species
    .map((planting) => ({
      id: planting.speciesId,
      label: getTreeSpecies(planting.speciesId).label,
      trees: planting.trees,
      share: metrics.trees === 0 ? 0 : roundTo(planting.trees / metrics.trees, 4),
    }))
    .sort((a, b) => b.trees - a.trees || a.id.localeCompare(b.id));

  return {
    campaignId: record.id,
    title: record.title,
    status: record.status,
    location: {
      country: record.location.country,
      region: record.location.region,
      label: `${record.location.region}, ${record.location.country}`,
    },
    species,
    trees: metrics.trees,
    completionRate: roundTo(metrics.progress, 4),
    co2: {
      perYearKg: metrics.co2PerYearKg,
      perYearTonnes: roundTo(metrics.co2PerYearTonnes, 3),
      over10YearsTonnes: roundTo(metrics.co2PerYearTonnes * 10, 3),
    },
    sponsorCount: metrics.sponsors,
    raisedXlm: roundTo(raisedXlm, 7),
    costPerTreeXlm: metrics.trees === 0 ? null : roundTo(raisedXlm / metrics.trees, 7),
  };
}

function metricValue(column: CampaignComparisonColumn, metric: ComparisonMetric): number | null {
  switch (metric) {
    case "completionRate":
      return column.completionRate;
    case "co2":
      return column.co2.perYearKg;
    case "sponsorCount":
      return column.sponsorCount;
    case "costPerTree":
      return column.costPerTreeXlm;
  }
}

/**
 * Which campaigns lead a metric. Higher wins, except cost per tree where lower
 * wins. A zero never leads a higher-is-better metric — "most sponsors: 0" is
 * not a highlight worth showing.
 */
export function comparisonLeaders(
  columns: readonly CampaignComparisonColumn[],
  metric: ComparisonMetric,
): string[] {
  if (columns.length < 2) return [];
  const lowerIsBetter = metric === "costPerTree";
  const scored = columns
    .map((column) => ({ id: column.campaignId, value: metricValue(column, metric) }))
    .filter((entry): entry is { id: string; value: number } =>
      entry.value !== null && (lowerIsBetter || entry.value > 0),
    );
  if (scored.length === 0) return [];
  const best = lowerIsBetter
    ? Math.min(...scored.map((entry) => entry.value))
    : Math.max(...scored.map((entry) => entry.value));
  return scored.filter((entry) => entry.value === best).map((entry) => entry.id);
}

/** Compare the requested campaigns, in the order they were requested. */
export function compareCampaigns(
  records: readonly ComparisonCampaignRecord[],
  ids: readonly string[],
): CampaignComparison {
  const byId = new Map(records.map((record) => [record.id, record]));
  const columns: CampaignComparisonColumn[] = [];
  const missing: string[] = [];
  for (const id of ids.slice(0, MAX_COMPARED_CAMPAIGNS)) {
    const record = byId.get(id);
    if (record) columns.push(buildComparisonColumn(record));
    else missing.push(id);
  }

  const leaders = {} as Record<ComparisonMetric, string[]>;
  for (const metric of COMPARISON_METRICS) {
    leaders[metric] = comparisonLeaders(columns, metric);
  }
  return { campaigns: columns, leaders, missing };
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

export interface ComparisonCampaignDataSource {
  getCampaigns(network?: string): Promise<ComparisonCampaignRecord[]>;
}

/** Planting locations for the leaderboard's demo campaigns, keyed by id. */
const DEMO_LOCATIONS: Record<string, CampaignLocation> = {
  "1": { country: "Kenya", region: "Lamu" },
  "2": { country: "Ethiopia", region: "Amhara" },
  "3": { country: "Niger", region: "Tillabéri" },
  "4": { country: "Ghana", region: "Ashanti" },
  "5": { country: "Nigeria", region: "Lagos" },
};

/**
 * Default source. Like the impact leaderboard, it serves the deterministic
 * demo campaigns until an indexer for the `campaign-funding` contract and its
 * planting records is wired in, and nothing under test.
 */
export class DefaultComparisonCampaignDataSource implements ComparisonCampaignDataSource {
  async getCampaigns(): Promise<ComparisonCampaignRecord[]> {
    if (process.env.NODE_ENV === "test") return [];
    return demoImpactCampaigns().map((record) => ({
      ...record,
      location: DEMO_LOCATIONS[record.id] ?? { country: "Unknown", region: "Unknown" },
    }));
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class CampaignComparisonService {
  private readonly dataSource: ComparisonCampaignDataSource;

  constructor(options: { dataSource?: ComparisonCampaignDataSource } = {}) {
    this.dataSource = options.dataSource ?? new DefaultComparisonCampaignDataSource();
  }

  /** Campaigns a sponsor can choose from, alphabetically. */
  async listOptions(network = "testnet"): Promise<ComparisonOption[]> {
    const campaigns = await this.dataSource.getCampaigns(network);
    return campaigns
      .map((campaign) => ({
        campaignId: campaign.id,
        title: campaign.title,
        status: campaign.status,
        location: `${campaign.location.region}, ${campaign.location.country}`,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }

  async compare(ids: readonly string[], network = "testnet"): Promise<CampaignComparison> {
    return compareCampaigns(await this.dataSource.getCampaigns(network), ids);
  }
}

let _defaultService: CampaignComparisonService | null = null;

export function getCampaignComparisonService(): CampaignComparisonService {
  if (!_defaultService) _defaultService = new CampaignComparisonService();
  return _defaultService;
}

/** Replace the process-wide service; used by route tests to inject fixtures. */
export function setCampaignComparisonService(service: CampaignComparisonService | null): void {
  _defaultService = service;
}
