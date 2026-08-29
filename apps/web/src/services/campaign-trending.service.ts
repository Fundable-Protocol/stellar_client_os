/**
 * Campaign Trending Service (issue #728)
 *
 * Ranks funding campaigns by a single, tunable trending score derived from
 * three orthogonal signals:
 *
 *   1. **Daily velocity**        — contribution volume raised in the last 24 h.
 *      A campaign that is pulling fresh capital right now trends higher than
 *      an otherwise large campaign that has gone quiet.
 *   2. **Engagement rate**       — how broad the backing is. A campaign funded
 *      by many distinct contributors is treated as more "alive" than one that
 *      is propped up by a single large donor, regardless of dollar volume.
 *   3. **Completion probability**— the estimated probability that the campaign
 *      reaches its success threshold (`minTarget`) before its `deadline`,
 *      extrapolated from its funding pace so far.
 *
 * The three component scores are min–max normalised across the candidate set
 * so each lives in [0, 1], then combined with configurable weights into a final
 * score in [0, 100]. Weights are tunable at construction time or through the
 * `TRENDING_*_WEIGHT` environment variables, mirroring the "single, tunable
 * metric" requirement.
 *
 * Amounts are carried as decimal strings (stroops) to avoid JavaScript BigInt
 * serialisation issues, matching the existing analytics gateway. Internally the
 * metric math uses `Number`, which is safe for the magnitudes used here.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CampaignStatus = "Active" | "Successful" | "Failed" | "Claimed";

/** A single contribution event, as surfaced by the on-chain indexer. */
export interface ContributionRecord {
  /** Contributor Stellar address. */
  contributor: string;
  /** Contribution amount in stroops (as string). */
  amount: string;
  /** Unix timestamp (seconds) the contribution was made. */
  timestamp: number;
}

/** A campaign record as indexed from the `campaign-funding` Soroban contract. */
export interface CampaignRecord {
  /** On-chain campaign id (numeric string). */
  id: string;
  /** Creator Stellar address that receives proceeds on success. */
  creator: string;
  /** Funding token contract address. */
  token: string;
  /** Hard-cap target in stroops (as string). */
  targetAmount: string;
  /** Minimum success threshold in stroops (as string). */
  minTarget: string;
  /** Unix timestamp (seconds) the campaign was created / first funded. */
  createdAt: number;
  /** Unix timestamp (seconds) after which contributions are no longer accepted. */
  deadline: number;
  /** Running total escrowed in stroops (as string). */
  totalRaised: string;
  /** Current lifecycle state. */
  status: CampaignStatus;
  /** Recent contributions used to derive velocity and engagement. */
  contributions?: ContributionRecord[];
  /** Number of distinct contributors (derived from `contributions` when omitted). */
  uniqueContributors?: number;
  /** Total number of contribution events (derived from `contributions` when omitted). */
  contributionCount?: number;
}
/** Tunable weights for the three trending signals. */
export interface TrendingWeights {
  velocity: number;
  engagement: number;
  completion: number;
}

/** Filtering / pagination options for ranked results. */
export interface TrendingCampaignOptions {
  /** Soroban network the campaigns were indexed from. */
  network?: string;
  /** Maximum number of ranked campaigns to return (default 20, max 100). */
  limit?: number;
  /** Zero-based offset into the ranked list (default 0). */
  offset?: number;
  /** Include non-Active campaigns (e.g. recently completed) in rankings. */
  includeNonActive?: boolean;
}

/** Raw per-campaign signals, exposed for transparency and debugging. */
export interface CampaignTrendingRaw {
  /** Token volume (stroops) raised in the trailing 24 h window. */
  dailyVelocity: number;
  /** Share of contribution events that came from distinct contributors (0–1). */
  engagementRate: number;
  /** Estimated probability of reaching `minTarget` by `deadline` (0–1). */
  completionProbability: number;
  /** Distinct contributor count. */
  uniqueContributors: number;
  /** Total contribution event count. */
  contributionCount: number;
  /** Current raised progress against the success goal (0–1). */
  progressPercent: number;
}

/** Normalised component sub-scores, each in [0, 1]. */
export interface CampaignTrendingComponents {
  velocity: number;
  engagement: number;
  completion: number;
}

/** A campaign with its computed trending score. */
export interface CampaignTrendingScore extends CampaignRecord {
  /** Composite trending score in [0, 100] (higher = more trending). */
  score: number;
  /** One-based ranking position (1 = most trending). */
  rank: number;
  components: CampaignTrendingComponents;
  raw: CampaignTrendingRaw;
}

/** Pluggable campaign source — swap for a real RPC/indexer in production. */
export interface CampaignDataSource {
  getCampaigns(network?: string): Promise<CampaignRecord[]>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** One day in seconds. */
export const DAY_SECONDS = 86_400;
/** Trailing window used for the daily-velocity signal. */
export const VELOCITY_WINDOW_SECONDS = DAY_SECONDS;

/** Default signal weights — velocity / engagement / completion. */
export const DEFAULT_WEIGHTS: TrendingWeights = {
  velocity: 0.4,
  engagement: 0.3,
  completion: 0.3,
};

/**
 * Neutral completion prior used for campaigns that have no elapsed funding time
 * yet (just launched), where a rate-based projection cannot be computed.
 */
export const NEUTRAL_COMPLETION_PRIOR = 0.5;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Parse a possibly-missing stroop string into a non-negative number. */
function toNonNegativeNumber(value: string | number | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Distinct contributor and event counts for a campaign. */
function engagementCounts(record: CampaignRecord): {
  unique: number;
  count: number;
} {
  if (
    record.uniqueContributors !== undefined &&
    record.contributionCount !== undefined
  ) {
    return { unique: record.uniqueContributors, count: record.contributionCount };
  }

  const contributions = record.contributions ?? [];
  const unique = new Set(contributions.map((entry) => entry.contributor)).size;
  return {
    unique: record.uniqueContributors ?? unique,
    count: record.contributionCount ?? contributions.length,
  };
}

/** Success goal in stroops: the minimum target, falling back to the hard cap. */
function successGoal(record: CampaignRecord): number {
  const minTarget = toNonNegativeNumber(record.minTarget);
  const targetAmount = toNonNegativeNumber(record.targetAmount);
  return Math.max(1, minTarget > 0 ? minTarget : targetAmount);
}
// ---------------------------------------------------------------------------
// Signal calculations (pure, exported for testing)
// ---------------------------------------------------------------------------

/**
 * Total contribution volume (stroops) raised within the trailing 24 h window.
 *
 * Contributions outside `[now - window, now]` are ignored.
 */
export function calculateDailyVelocity(
  record: CampaignRecord,
  now: number
): number {
  const windowStart = now - VELOCITY_WINDOW_SECONDS;
  let total = 0;
  for (const contribution of record.contributions ?? []) {
    if (
      contribution.timestamp >= windowStart &&
      contribution.timestamp <= now
    ) {
      total += toNonNegativeNumber(contribution.amount);
    }
  }
  return total;
}

/**
 * Engagement rate: the share of contribution events that came from distinct
 * contributors. Ranges in [0, 1]; 1 means every contribution came from a
 * different wallet, 0 means no engagement data is available.
 */
export function calculateEngagementRate(record: CampaignRecord): number {
  const { unique, count } = engagementCounts(record);
  if (count === 0) return 0;
  return unique / count;
}

/**
 * Raw engagement metric used for cross-campaign normalisation.
 *
 * Rewards both breadth (distinct share) and community scale, with the unique
 * contributor count log-dampened so a single large campaign cannot dominate.
 */
export function engagementMetric(record: CampaignRecord): number {
  const { unique, count } = engagementCounts(record);
  if (count === 0) return 0;
  const breadth = unique / count;
  return breadth * Math.log1p(unique);
}
/**
 * Estimated probability (0–1) that the campaign reaches its success goal by its
 * deadline, based on a linear projection of the funding pace observed so far.
 *
 * - Terminal states are deterministic: `Successful`/`Claimed` → 1, `Failed` → 0.
 * - An expired campaign resolves to 1 only if it already met its goal.
 * - A campaign that already reached its goal is treated as probability 1.
 * - A freshly launched campaign (no elapsed time) uses a neutral prior so it is
 *   not immediately zeroed out.
 * - Otherwise: `projected = raised + pace · timeRemaining`, normalised against
 *   the success goal and clamped to [0, 1].
 */
export function calculateCompletionProbability(
  record: CampaignRecord,
  now: number
): number {
  if (record.status === "Successful" || record.status === "Claimed") return 1;
  if (record.status === "Failed") return 0;

  const goal = successGoal(record);
  const raised = toNonNegativeNumber(record.totalRaised);
  if (raised >= goal) return 1;

  // Guard against degenerate records (missing / non-finite timing) so a single
  // malformed index row cannot inject NaNs into the ranking.
  const nowValue = Number(now);
  const deadline = Number(record.deadline);
  if (!Number.isFinite(nowValue) || !Number.isFinite(deadline)) {
    return NEUTRAL_COMPLETION_PRIOR;
  }
  if (nowValue >= deadline) {
    return raised >= goal ? 1 : 0;
  }

  const elapsed = nowValue - Math.max(0, Number(record.createdAt) || 0);
  if (elapsed <= 0) {
    // No evidence yet — use a neutral prior rather than a hard zero.
    return NEUTRAL_COMPLETION_PRIOR;
  }

  const remaining = Math.max(0, deadline - nowValue);
  const pacePerSecond = raised / elapsed;
  const projected = raised + pacePerSecond * remaining;
  return clamp01(projected / goal);
}

/** Current raised progress against the success goal (0–1). */
export function campaignProgress(record: CampaignRecord): number {
  return clamp01(
    toNonNegativeNumber(record.totalRaised) / successGoal(record)
  );
}
// ---------------------------------------------------------------------------
// Normalisation & scoring
// ---------------------------------------------------------------------------

/** Min–max normalise a vector to [0, 1]. Equal inputs map to 1 (constantised). */
function normalizeMinMax(values: number[]): number[] {
  if (values.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (max === min) return values.map(() => 1);
  return values.map((value) => (value - min) / (max - min));
}

/** Clamp and normalise supplied weights so they sum to 1. */
export function normalizeWeights(weights: TrendingWeights): TrendingWeights {
  const clamped: TrendingWeights = {
    velocity: Math.max(0, weights.velocity),
    engagement: Math.max(0, weights.engagement),
    completion: Math.max(0, weights.completion),
  };
  const sum = clamped.velocity + clamped.engagement + clamped.completion;
  if (sum <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    velocity: clamped.velocity / sum,
    engagement: clamped.engagement / sum,
    completion: clamped.completion / sum,
  };
}
/**
 * Compute trending scores for a list of campaigns.
 *
 * Sub-scores are min–max normalised across the whole list, so the returned
 * score is relative to the candidate set rather than absolute. The result is
 * sorted descending by score and paginated by the caller.
 */
export function scoreTrendingCampaigns(
  campaigns: CampaignRecord[],
  weights: TrendingWeights = DEFAULT_WEIGHTS,
  now: number = Date.now() / 1000
): CampaignTrendingScore[] {
  const normalizedWeights = normalizeWeights(weights);

  const velocityVec = campaigns.map((campaign) =>
    Math.log1p(calculateDailyVelocity(campaign, now))
  );
  const engagementVec = campaigns.map((campaign) =>
    engagementMetric(campaign)
  );
  const completionVec = campaigns.map((campaign) =>
    calculateCompletionProbability(campaign, now)
  );

  const velocityScores = normalizeMinMax(velocityVec);
  const engagementScores = normalizeMinMax(engagementVec);
  const completionScores = normalizeMinMax(completionVec);

  const scored = campaigns.map((campaign, index) => {
    const components: CampaignTrendingComponents = {
      velocity: velocityScores[index],
      engagement: engagementScores[index],
      completion: completionScores[index],
    };
    const composite =
      normalizedWeights.velocity * components.velocity +
      normalizedWeights.engagement * components.engagement +
      normalizedWeights.completion * components.completion;
    const { unique, count } = engagementCounts(campaign);

    return {
      ...campaign,
      score: Number((composite * 100).toFixed(2)),
      rank: 0, // assigned after sorting
      components,
      raw: {
        dailyVelocity: Math.round(calculateDailyVelocity(campaign, now)),
        engagementRate: Number(calculateEngagementRate(campaign).toFixed(4)),
        completionProbability: Number(
          calculateCompletionProbability(campaign, now).toFixed(4)
        ),
        uniqueContributors: unique,
        contributionCount: count,
        progressPercent: Number(campaignProgress(campaign).toFixed(4)),
      },
    };
  });

  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  scored.forEach((campaign, index) => {
    campaign.rank = index + 1;
  });

  return scored;
}
// ---------------------------------------------------------------------------
// Default data source
// ---------------------------------------------------------------------------

/**
 * Default campaign source.
 *
 * In production this indexes the `campaign-funding` Soroban contract via the
 * Stellar RPC `getEvents` API (and cross-references an off-chain CDC indexer
 * for the richer `contributions` history). Like the analytics gateway, it
 * returns stable demo fixtures in non-production environments so the endpoint
 * is functional out of the box without network access.
 */
export class DefaultCampaignDataSource implements CampaignDataSource {
  async getCampaigns(_network?: string): Promise<CampaignRecord[]> {
    if (process.env.NODE_ENV === "test") return [];

    // Real implementation sketch (production):
    //   const rpcUrl = network === "mainnet"
    //     ? "https://soroban.stellar.org"
    //     : "https://soroban-testnet.stellar.org";
    //   const rpc = new Server(rpcUrl);
    //   const events = await rpc.getEvents({ contracts: [CAMPAIGN_CONTRACT] });
    //   return rebuildCampaignsFromEvents(events);
    return demoCampaigns();
  }
}

/**
 * Deterministic demo campaigns used to exercise the ranking pipeline without a
 * live network. Times are expressed relative to "now" so behaviour is stable.
 */
export function demoCampaigns(): CampaignRecord[] {
  const now = Math.floor(Date.now() / 1000);
  const day = DAY_SECONDS;
  const in24h = (hoursAgo: number) => now - Math.floor(hoursAgo * 3600);

  return [
    {
      id: "1",
      creator: "GBREAKER1",
      token: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      targetAmount: "10000000000",
      minTarget: "5000000000",
      createdAt: now - 14 * day,
      deadline: now + 16 * day,
      totalRaised: "4250000000",
      status: "Active",
      uniqueContributors: 38,
      contributionCount: 44,
      contributions: [
        { contributor: "GALICE", amount: "500000000", timestamp: in24h(2) },
        { contributor: "GBOB", amount: "250000000", timestamp: in24h(5) },
        { contributor: "GCAROL", amount: "1000000000", timestamp: in24h(9) },
      ],
    },
    {
      id: "2",
      creator: "GVET01",
      token: "CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB4",
      targetAmount: "25000000000",
      minTarget: "10000000000",
      createdAt: now - 2 * day,
      deadline: now + 28 * day,
      totalRaised: "9000000000",
      status: "Active",
      uniqueContributors: 5,
      contributionCount: 12,
      contributions: [
        { contributor: "GDONOR1", amount: "3000000000", timestamp: in24h(1) },
        { contributor: "GDONOR2", amount: "3000000000", timestamp: in24h(3) },
        { contributor: "GDONOR3", amount: "3000000000", timestamp: in24h(6) },
      ],
    },
    {
      id: "3",
      creator: "GSTALE1",
      token: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
      targetAmount: "5000000000",
      minTarget: "1000000000",
      createdAt: now - 40 * day,
      deadline: now - 10 * day,
      totalRaised: "800000000",
      status: "Failed",
      uniqueContributors: 3,
      contributionCount: 3,
    },
  ];
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface CampaignTrendingServiceOptions {
  dataSource?: CampaignDataSource;
  weights?: Partial<TrendingWeights>;
}

export interface CampaignTrendingResponse {
  data: CampaignTrendingScore[];
  meta: {
    total: number;
    evaluated: number;
    weights: TrendingWeights;
    generatedAt: number;
    network: string;
  };
}

/** Read the tunable trend weights from environment variables with defaults. */
export function weightsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): TrendingWeights {
  const parse = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  return normalizeWeights({
    velocity: parse(env.TRENDING_VELOCITY_WEIGHT, DEFAULT_WEIGHTS.velocity),
    engagement: parse(env.TRENDING_ENGAGEMENT_WEIGHT, DEFAULT_WEIGHTS.engagement),
    completion: parse(env.TRENDING_COMPLETION_WEIGHT, DEFAULT_WEIGHTS.completion),
  });
}

export class CampaignTrendingService {
  private readonly dataSource: CampaignDataSource;
  private readonly weights: TrendingWeights;

  constructor(options: CampaignTrendingServiceOptions = {}) {
    this.dataSource = options.dataSource ?? new DefaultCampaignDataSource();
    this.weights = normalizeWeights({
      ...weightsFromEnv(),
      ...options.weights,
    });
  }

  /** Fetch the raw campaign list from the configured data source. */
  async getCampaigns(network = "testnet"): Promise<CampaignRecord[]> {
    return this.dataSource.getCampaigns(network);
  }

  /**
   * Return campaigns ranked by the composite trending score.
   *
   * Only `Active` campaigns are ranked by default (a closed campaign is not
   * "trending"); pass `includeNonActive` to broaden the result set.
   */
  async getTrendingCampaigns(
    options: TrendingCampaignOptions = {}
  ): Promise<CampaignTrendingResponse> {
    const network = options.network ?? "testnet";
    const campaigns = await this.getCampaigns(network);

    const eligible = options.includeNonActive
      ? campaigns
      : campaigns.filter((campaign) => campaign.status === "Active");

    const ranked = scoreTrendingCampaigns(eligible, this.weights);

    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    return {
      data: ranked.slice(offset, offset + limit),
      meta: {
        total: ranked.length,
        evaluated: campaigns.length,
        weights: this.weights,
        generatedAt: Math.floor(Date.now() / 1000),
        network,
      },
    };
  }
}

/** Module-level singleton — shared across requests in the same process. */
let _defaultService: CampaignTrendingService | null = null;

export function getCampaignTrendingService(
  dataSource?: CampaignDataSource
): CampaignTrendingService {
  if (dataSource) return new CampaignTrendingService({ dataSource });
  if (!_defaultService) _defaultService = new CampaignTrendingService();
  return _defaultService;
}








