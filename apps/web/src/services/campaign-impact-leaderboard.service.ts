/**
 * Campaign impact leaderboard (issue #935)
 *
 * Public, read-only ranking of funding campaigns by the impact they produced,
 * across five boards:
 *
 *   1. **trees**    — most trees planted.
 *   2. **co2**      — most CO2 sequestered per year (derived from the planting mix).
 *   3. **sponsors** — most distinct sponsors/backers.
 *   4. **fastest**  — shortest time from creation to reaching the success threshold.
 *   5. **species**  — most diverse species mix.
 *
 * The board orderings are pure functions over the campaign records, so the
 * endpoint is deterministic and testable without a network. CO2 uses the base
 * annual per-species rate in `TREE_SPECIES` (`@/lib/co2-impact`); the
 * rainy-season 2x bonus from `calculateCo2Offset` is deliberately *not* applied
 * because it is a projection for a single planting decision, not a measured
 * value — applying it would change a campaign's rank depending on the month the
 * leaderboard happened to be read.
 */

import { getTreeSpecies } from "@/lib/co2-impact";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImpactCampaignStatus = "Active" | "Successful" | "Failed" | "Claimed";

/** Trees planted for a single species within a campaign. */
export interface SpeciesPlanting {
  /** Species id from `TREE_SPECIES` (`@/lib/co2-impact`). */
  speciesId: string;
  /** Trees planted. Fractional/negative values are clamped to 0. */
  trees: number;
}

/** A campaign as indexed for impact reporting. */
export interface CampaignImpactRecord {
  /** On-chain campaign id (numeric string). */
  id: string;
  /** Human-readable campaign title. */
  title: string;
  /** Creator Stellar address. */
  creator: string;
  /** Campaign lifecycle state, mirroring the `campaign-funding` contract. */
  status: ImpactCampaignStatus;
  /** Unix timestamp (seconds) the campaign was created. */
  createdAt: number;
  /**
   * Unix timestamp (seconds) the campaign reached its success threshold.
   * `null` while the campaign is still funding or never completed.
   */
  completedAt: number | null;
  /** Hard-cap target in stroops (decimal string). */
  targetAmount: string;
  /** Total raised in stroops (decimal string). */
  totalRaised: string;
  /** Number of distinct sponsors/backers that funded the campaign. */
  sponsorCount: number;
  /** Per-species planting breakdown. */
  species: SpeciesPlanting[];
}

/** The five boards exposed by the leaderboard. */
export const IMPACT_LEADERBOARD_CATEGORIES = [
  "trees",
  "co2",
  "sponsors",
  "fastest",
  "species",
] as const;

export type ImpactLeaderboardCategory = (typeof IMPACT_LEADERBOARD_CATEGORIES)[number];

/** Unit of the ranked `value` for each board. */
export const IMPACT_LEADERBOARD_UNITS: Record<ImpactLeaderboardCategory, string> = {
  trees: "trees",
  co2: "kgCO2e/year",
  sponsors: "sponsors",
  fastest: "seconds",
  species: "species",
};

/** Impact metrics derived from a single campaign record. */
export interface CampaignImpactMetrics {
  /** Total trees planted across all species. */
  trees: number;
  /** Projected first-year CO2 uptake in kilograms. */
  co2PerYearKg: number;
  /** `co2PerYearKg` expressed in tonnes. */
  co2PerYearTonnes: number;
  /** Distinct sponsors/backers. */
  sponsors: number;
  /** Number of distinct species planted. */
  speciesCount: number;
  /** Normalised planting breakdown, deduplicated by species. */
  species: SpeciesPlanting[];
  /** Raised / target, clamped to [0, 1]. */
  progress: number;
  /** Seconds from creation to success threshold, or `null` if not completed. */
  completionSeconds: number | null;
  /** Unix seconds the campaign completed, or `null`. */
  completedAt: number | null;
}

/** One row of a board. */
export interface ImpactLeaderboardEntry {
  /** 1-based position within the board. */
  rank: number;
  campaignId: string;
  title: string;
  creator: string;
  status: ImpactCampaignStatus;
  /** Value of the ranked metric, in `IMPACT_LEADERBOARD_UNITS[category]`. */
  value: number;
  metrics: CampaignImpactMetrics;
}

export interface ImpactCampaignDataSource {
  getCampaigns(network?: string): Promise<CampaignImpactRecord[]>;
}

export interface ImpactLeaderboardQuery {
  /** Soroban network to read from. Defaults to `testnet`. */
  network?: string;
  /** Max entries per board (1–50). Defaults to 10. */
  limit?: number;
}

export interface CampaignImpactLeaderboardResponse {
  data: Record<ImpactLeaderboardCategory, ImpactLeaderboardEntry[]>;
  meta: {
    /** Number of campaigns loaded from the data source. */
    evaluated: number;
    /** Max entries returned per board. */
    limit: number;
    /** Unit of each board's `value`. */
    units: Record<ImpactLeaderboardCategory, string>;
    /** Ranked (pre-slice) campaign count per board. */
    totals: Record<ImpactLeaderboardCategory, number>;
    /** Unix seconds the response was generated. */
    generatedAt: number;
    network: string;
  };
}

// ---------------------------------------------------------------------------
// Metric derivation
// ---------------------------------------------------------------------------

export const DEFAULT_IMPACT_LIMIT = 10;
export const MAX_IMPACT_LIMIT = 50;

/** Coerce a possibly-string, possibly-undefined value into a finite, non-negative number. */
function toNonNegativeNumber(value: string | number | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : value ?? 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Normalise the planting breakdown: species ids are deduplicated and summed,
 * counts are floored, and non-positive entries are dropped.
 */
export function normalizeSpeciesPlanting(
  record: Pick<CampaignImpactRecord, "species">,
): SpeciesPlanting[] {
  const totals = new Map<string, number>();
  for (const planting of record.species ?? []) {
    if (!planting?.speciesId) continue;
    const trees = Math.max(0, Math.floor(toNonNegativeNumber(planting.trees)));
    if (trees === 0) continue;
    totals.set(planting.speciesId, (totals.get(planting.speciesId) ?? 0) + trees);
  }
  return [...totals.entries()].map(([speciesId, trees]) => ({ speciesId, trees }));
}

/** Total trees planted by a campaign. */
export function campaignTreeCount(record: CampaignImpactRecord): number {
  return normalizeSpeciesPlanting(record).reduce((sum, planting) => sum + planting.trees, 0);
}

/**
 * Projected first-year CO2 uptake in kilograms, using the base annual rate for
 * each species (unknown species ids fall back to the first entry of
 * `TREE_SPECIES`, matching `getTreeSpecies`).
 */
export function campaignCo2PerYearKg(record: CampaignImpactRecord): number {
  return normalizeSpeciesPlanting(record).reduce(
    (sum, planting) => sum + planting.trees * getTreeSpecies(planting.speciesId).co2PerTreePerYearKg,
    0,
  );
}

/** Number of distinct species planted by a campaign. */
export function campaignSpeciesCount(record: CampaignImpactRecord): number {
  return normalizeSpeciesPlanting(record).length;
}

/** Seconds from creation to the success threshold, or `null` when not completed yet. */
export function campaignCompletionSeconds(record: CampaignImpactRecord): number | null {
  if (record.completedAt === null || record.completedAt === undefined) return null;
  if (!Number.isFinite(record.completedAt) || !Number.isFinite(record.createdAt)) return null;
  const seconds = Math.floor(record.completedAt) - Math.floor(record.createdAt);
  return seconds >= 0 ? seconds : null;
}

/** Raised / target as a fraction in [0, 1]; 0 when the target is missing or invalid. */
export function campaignFundingProgress(record: CampaignImpactRecord): number {
  const target = toNonNegativeNumber(record.targetAmount);
  if (target === 0) return 0;
  return Math.min(1, toNonNegativeNumber(record.totalRaised) / target);
}

/** Derive every metric a board can rank on from a raw campaign record. */
export function computeCampaignImpactMetrics(
  record: CampaignImpactRecord,
): CampaignImpactMetrics {
  const species = normalizeSpeciesPlanting(record);
  const co2PerYearKg = species.reduce(
    (sum, planting) => sum + planting.trees * getTreeSpecies(planting.speciesId).co2PerTreePerYearKg,
    0,
  );

  return {
    trees: species.reduce((sum, planting) => sum + planting.trees, 0),
    co2PerYearKg,
    co2PerYearTonnes: co2PerYearKg / 1000,
    sponsors: Math.floor(toNonNegativeNumber(record.sponsorCount)),
    speciesCount: species.length,
    species,
    progress: campaignFundingProgress(record),
    completionSeconds: campaignCompletionSeconds(record),
    completedAt: record.completedAt ?? null,
  };
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/** The value a board ranks on, or `null` when the campaign is not eligible for it. */
export function impactMetricValue(
  metrics: CampaignImpactMetrics,
  category: ImpactLeaderboardCategory,
): number | null {
  switch (category) {
    case "trees":
      return metrics.trees;
    case "co2":
      return metrics.co2PerYearKg;
    case "sponsors":
      return metrics.sponsors;
    case "species":
      return metrics.speciesCount;
    case "fastest":
      // Only completed campaigns can be ranked on speed.
      return metrics.completionSeconds;
  }
}

/**
 * Rank campaigns for one board.
 *
 * Campaigns without a value for the board are dropped (`fastest` only ranks
 * completed campaigns) along with campaigns that scored zero, so a board never
 * pads its tail with campaigns that produced no impact. Ties are broken by tree
 * count, then CO2, then campaign id so the ordering is stable across requests.
 */
export function rankImpactCampaigns(
  records: readonly CampaignImpactRecord[],
  category: ImpactLeaderboardCategory,
  limit = DEFAULT_IMPACT_LIMIT,
): ImpactLeaderboardEntry[] {
  const scored = records
    .map((record) => {
      const metrics = computeCampaignImpactMetrics(record);
      return { record, metrics, value: impactMetricValue(metrics, category) };
    })
    .filter(
      (entry): entry is { record: CampaignImpactRecord; metrics: CampaignImpactMetrics; value: number } =>
        entry.value !== null && (category === "fastest" || entry.value > 0),
    );

  scored.sort((a, b) => {
    // `fastest` ascending (shorter is better); every other board descending.
    const primary = category === "fastest" ? a.value - b.value : b.value - a.value;
    if (primary !== 0) return primary;
    if (a.metrics.trees !== b.metrics.trees) return b.metrics.trees - a.metrics.trees;
    if (a.metrics.co2PerYearKg !== b.metrics.co2PerYearKg) {
      return b.metrics.co2PerYearKg - a.metrics.co2PerYearKg;
    }
    return a.record.id.localeCompare(b.record.id, "en", { numeric: true });
  });

  return scored.slice(0, Math.max(0, limit)).map((entry, index) => ({
    rank: index + 1,
    campaignId: entry.record.id,
    title: entry.record.title,
    creator: entry.record.creator,
    status: entry.record.status,
    value: entry.value,
    metrics: entry.metrics,
  }));
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

/**
 * Default campaign source.
 *
 * In production this indexes the `campaign-funding` Soroban contract together
 * with the planting records that back the trees/species numbers. Like the
 * trending service, it returns stable demo fixtures outside test environments
 * so the endpoint is functional without network access.
 */
export class DefaultImpactCampaignDataSource implements ImpactCampaignDataSource {
  async getCampaigns(_network?: string): Promise<CampaignImpactRecord[]> {
    if (process.env.NODE_ENV === "test") return [];
    return demoImpactCampaigns();
  }
}

/** Deterministic demo campaigns used to exercise the boards without a live indexer. */
export function demoImpactCampaigns(): CampaignImpactRecord[] {
  const now = Math.floor(Date.now() / 1000);
  const day = 86_400;

  return [
    {
      id: "1",
      title: "Mangrove Belt Restoration",
      creator: "GMANGROVE",
      status: "Successful",
      createdAt: now - 60 * day,
      completedAt: now - 38 * day,
      targetAmount: "10000000000",
      totalRaised: "11800000000",
      sponsorCount: 214,
      species: [
        { speciesId: "teak", trees: 4200 },
        { speciesId: "neem", trees: 3100 },
        { speciesId: "mango", trees: 900 },
        { speciesId: "cedar", trees: 400 },
      ],
    },
    {
      id: "2",
      title: "Highland Pine Corridor",
      creator: "GHIGHLAND",
      status: "Successful",
      createdAt: now - 45 * day,
      completedAt: now - 40 * day,
      targetAmount: "6000000000",
      totalRaised: "7300000000",
      sponsorCount: 168,
      species: [
        { speciesId: "pine", trees: 5100 },
        { speciesId: "oak", trees: 2600 },
      ],
    },
    {
      id: "3",
      title: "Sahel Fast-Growth Shelterbelt",
      creator: "GSAHEL",
      status: "Successful",
      createdAt: now - 20 * day,
      completedAt: now - 12 * day,
      targetAmount: "12000000000",
      totalRaised: "12400000000",
      sponsorCount: 96,
      species: [
        { speciesId: "eucalyptus", trees: 3800 },
        { speciesId: "neem", trees: 1200 },
      ],
    },
    {
      id: "4",
      title: "Community Orchard Diversity Pilot",
      creator: "GORCHARD",
      status: "Active",
      createdAt: now - 9 * day,
      completedAt: null,
      targetAmount: "20000000000",
      totalRaised: "4200000000",
      sponsorCount: 331,
      species: [
        { speciesId: "mango", trees: 850 },
        { speciesId: "oak", trees: 640 },
        { speciesId: "maple", trees: 520 },
        { speciesId: "neem", trees: 410 },
        { speciesId: "teak", trees: 300 },
        { speciesId: "cedar", trees: 180 },
        { speciesId: "pine", trees: 150 },
        { speciesId: "eucalyptus", trees: 90 },
      ],
    },
    {
      id: "5",
      title: "Failed Urban Fringe Planting",
      creator: "GURBAN",
      status: "Failed",
      createdAt: now - 80 * day,
      completedAt: null,
      targetAmount: "5000000000",
      totalRaised: "900000000",
      sponsorCount: 12,
      species: [{ speciesId: "maple", trees: 120 }],
    },
  ];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_IMPACT_LIMIT;
  if (!Number.isFinite(limit)) return DEFAULT_IMPACT_LIMIT;
  return Math.min(Math.max(Math.floor(limit), 1), MAX_IMPACT_LIMIT);
}

export interface CampaignImpactLeaderboardServiceOptions {
  dataSource?: ImpactCampaignDataSource;
}

export class CampaignImpactLeaderboardService {
  private readonly dataSource: ImpactCampaignDataSource;

  constructor(options: CampaignImpactLeaderboardServiceOptions = {}) {
    this.dataSource = options.dataSource ?? new DefaultImpactCampaignDataSource();
  }

  /** Fetch the raw campaign list from the configured data source. */
  async getCampaigns(network = "testnet"): Promise<CampaignImpactRecord[]> {
    return this.dataSource.getCampaigns(network);
  }

  /** Compute all five boards for the requested network. */
  async getLeaderboard(
    query: ImpactLeaderboardQuery = {},
  ): Promise<CampaignImpactLeaderboardResponse> {
    const network = query.network ?? "testnet";
    const limit = normalizeLimit(query.limit);
    const campaigns = await this.getCampaigns(network);

    const data = {} as Record<ImpactLeaderboardCategory, ImpactLeaderboardEntry[]>;
    const totals = {} as Record<ImpactLeaderboardCategory, number>;

    for (const category of IMPACT_LEADERBOARD_CATEGORIES) {
      const ranked = rankImpactCampaigns(campaigns, category);
      totals[category] = ranked.length;
      data[category] = ranked.slice(0, limit);
    }

    return {
      data,
      meta: {
        evaluated: campaigns.length,
        limit,
        units: { ...IMPACT_LEADERBOARD_UNITS },
        totals,
        generatedAt: Math.floor(Date.now() / 1000),
        network,
      },
    };
  }
}

/** Module-level singleton — shared across requests in the same process. */
let _defaultService: CampaignImpactLeaderboardService | null = null;

export function getCampaignImpactLeaderboardService(): CampaignImpactLeaderboardService {
  if (!_defaultService) _defaultService = new CampaignImpactLeaderboardService();
  return _defaultService;
}

/**
 * Replace the process-wide service.
 *
 * Used by route tests to inject a fixture data source, and available to
 * deployments that want to point the boards at a real indexer without changing
 * the route.
 */
export function setCampaignImpactLeaderboardService(
  service: CampaignImpactLeaderboardService | null,
): void {
  _defaultService = service;
}
