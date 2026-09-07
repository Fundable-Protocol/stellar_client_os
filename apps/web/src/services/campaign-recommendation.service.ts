/**
 * Campaign Recommendation Service (issue #726)
 *
 * Produces the campaigns shown in a campaign detail page's “You might like”
 * section. Recommendations are intentionally explainable and deterministic:
 * campaigns are compared using fields available from the campaign indexer and
 * ranked by a weighted similarity score.
 */

import {
  CampaignTrendingService,
  getCampaignTrendingService,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign-trending.service";

export interface CampaignRecommendationOptions {
  /** Soroban network the campaigns were indexed from. */
  network?: string;
  /** Number of recommendations to return (default 5, maximum 5). */
  limit?: number;
  /** Include completed campaigns when true; defaults to active only. */
  includeNonActive?: boolean;
}

export interface CampaignSimilarity {
  /** Similarity score in [0, 100], where higher means more related. */
  score: number;
  /** Similarity contributions by comparable campaign attribute. */
  components: {
    token: number;
    target: number;
    minimumTarget: number;
    duration: number;
    creator: number;
  };
}

export interface CampaignRecommendation extends CampaignRecord {
  similarity: CampaignSimilarity;
}

export interface CampaignRecommendationResponse {
  data: CampaignRecommendation[];
  meta: {
    campaignId: string;
    total: number;
    evaluated: number;
    limit: number;
    network: string;
  };
}

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 5;
const ACTIVE_STATUS = "Active";

const SIMILARITY_WEIGHTS = {
  token: 0.35,
  target: 0.25,
  minimumTarget: 0.2,
  duration: 0.1,
  creator: 0.1,
} as const;

function safeNumber(value: string | number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

/**
 * Returns a logarithmic closeness score. This prevents large campaigns from
 * being treated as unrelated merely because their amounts differ in absolute
 * rather than proportional terms.
 */
function amountSimilarity(left: string, right: string): number {
  const a = safeNumber(left);
  const b = safeNumber(right);
  if (a === 0 && b === 0) return 1;
  if (a === 0 || b === 0) return 0;
  return Math.max(0, 1 - Math.abs(Math.log10(a) - Math.log10(b)) / 4);
}

function durationSimilarity(left: CampaignRecord, right: CampaignRecord): number {
  const leftDuration = safeNumber(left.deadline) - safeNumber(left.createdAt);
  const rightDuration = safeNumber(right.deadline) - safeNumber(right.createdAt);
  if (leftDuration <= 0 && rightDuration <= 0) return 1;
  if (leftDuration <= 0 || rightDuration <= 0) return 0;
  return Math.max(
    0,
    1 - Math.abs(Math.log10(leftDuration) - Math.log10(rightDuration)) / 3
  );
}

export function calculateCampaignSimilarity(
  viewed: CampaignRecord,
  candidate: CampaignRecord
): CampaignSimilarity {
  const components = {
    token: viewed.token === candidate.token ? 1 : 0,
    target: amountSimilarity(viewed.targetAmount, candidate.targetAmount),
    minimumTarget: amountSimilarity(viewed.minTarget, candidate.minTarget),
    duration: durationSimilarity(viewed, candidate),
    creator: viewed.creator === candidate.creator ? 1 : 0,
  };

  const score = Math.round(
    (components.token * SIMILARITY_WEIGHTS.token +
      components.target * SIMILARITY_WEIGHTS.target +
      components.minimumTarget * SIMILARITY_WEIGHTS.minimumTarget +
      components.duration * SIMILARITY_WEIGHTS.duration +
      components.creator * SIMILARITY_WEIGHTS.creator) *
      100
  );

  return { score, components };
}

export interface CampaignRecommendationServiceOptions {
  dataSource?: CampaignDataSource;
  trendingService?: CampaignTrendingService;
}

export class CampaignRecommendationService {
  private readonly dataSource?: CampaignDataSource;
  private readonly trendingService?: CampaignTrendingService;

  constructor(options: CampaignRecommendationServiceOptions = {}) {
    this.dataSource = options.dataSource;
    this.trendingService = options.trendingService;
  }

  private async getCampaigns(network: string): Promise<CampaignRecord[]> {
    if (this.dataSource) return this.dataSource.getCampaigns(network);
    if (this.trendingService) return this.trendingService.getCampaigns(network);
    return getCampaignTrendingService().getCampaigns(network);
  }

  async getRecommendations(
    campaignId: string,
    options: CampaignRecommendationOptions = {}
  ): Promise<CampaignRecommendationResponse> {
    const network = options.network ?? "testnet";
    const requestedLimit = Number(options.limit ?? DEFAULT_LIMIT);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(requestedLimit)))
      : DEFAULT_LIMIT;
    const campaigns = await this.getCampaigns(network);
    const viewed = campaigns.find((campaign) => campaign.id === campaignId);

    if (!viewed) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const eligible = campaigns.filter(
      (campaign) =>
        campaign.id !== campaignId &&
        (options.includeNonActive || campaign.status === ACTIVE_STATUS)
    );

    const ranked = eligible
      .map((campaign) => ({
        ...campaign,
        similarity: calculateCampaignSimilarity(viewed, campaign),
      }))
      .sort(
        (left, right) =>
          right.similarity.score - left.similarity.score ||
          safeNumber(right.totalRaised) - safeNumber(left.totalRaised) ||
          left.id.localeCompare(right.id)
      );

    return {
      data: ranked.slice(0, limit),
      meta: {
        campaignId,
        total: ranked.length,
        evaluated: campaigns.length,
        limit,
        network,
      },
    };
  }
}

let defaultService: CampaignRecommendationService | null = null;

export function getCampaignRecommendationService(
  dataSource?: CampaignDataSource
): CampaignRecommendationService {
  if (dataSource) return new CampaignRecommendationService({ dataSource });
  if (!defaultService) defaultService = new CampaignRecommendationService();
  return defaultService;
}

export { DEFAULT_LIMIT as DEFAULT_RECOMMENDATION_LIMIT, MAX_LIMIT as MAX_RECOMMENDATION_LIMIT };

