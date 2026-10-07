import { getCampaign } from "@/services/campaign.service";

export interface CampaignProgressMetrics {
  campaignId: string;
  treeCount: number;
  sponsorCount: number;
  co2ImpactKg: number;
  co2SequestrationTonnes: string;
  raisedAmount: string;
  goalAmount: string;
  cachedAt: number;
  expiresAt: number;
  ttlSeconds: number;
}

interface CacheEntry {
  data: CampaignProgressMetrics;
  expiresAt: number;
}

export interface CampaignProgressCacheOptions {
  /** Default TTL in seconds. Falls back to the environment/default when omitted. */
  ttlSeconds?: number;
  /** Injectable clock (ms since epoch). Defaults to `Date.now`. */
  now?: () => number;
}

/**
 * Default TTL for campaign progress metrics: 5 minutes (300 seconds).
 *
 * Overridable at construction time or via the
 * `CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS` environment variable.
 */
export const DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS = 300;

/**
 * Namespace for campaign progress cache keys.
 *
 * Keys are built as `campaign:progress:{campaignId}` so that different
 * campaigns (and, if parameters are ever introduced, different parameter
 * sets) never share an entry. Keep the prefix in sync with the Redis-backed
 * cache in `@/lib/campaign-progress-cache`.
 */
export const CAMPAIGN_PROGRESS_CACHE_KEY_PREFIX = "campaign:progress";

/** Build the isolated cache key for a campaign's progress metrics. */
export function buildCampaignProgressCacheKey(campaignId: string): string {
  return `${CAMPAIGN_PROGRESS_CACHE_KEY_PREFIX}:${campaignId}`;
}

function resolveDefaultTtl(explicit?: number): number {
  if (explicit !== undefined) {
    return explicit;
  }

  const raw = process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
  if (!raw) {
    return DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_CAMPAIGN_PROGRESS_TTL_SECONDS;
}

export class CampaignProgressCacheService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlSeconds: number;
  private now: () => number;
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(options: number | CampaignProgressCacheOptions = {}) {
    if (typeof options === "number") {
      this.defaultTtlSeconds = resolveDefaultTtl(options);
      this.now = () => Date.now();
    } else {
      this.defaultTtlSeconds = resolveDefaultTtl(options.ttlSeconds);
      this.now = options.now ?? (() => Date.now());
    }
  }

  get(campaignId: string): CampaignProgressMetrics | null {
    const key = buildCampaignProgressCacheKey(campaignId);
    const entry = this.cache.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (this.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  set(
    campaignId: string,
    metrics: Omit<CampaignProgressMetrics, "cachedAt" | "expiresAt" | "ttlSeconds">,
    ttlSeconds = this.defaultTtlSeconds
  ): CampaignProgressMetrics {
    const key = buildCampaignProgressCacheKey(campaignId);
    const now = this.now();
    const expiresAt = now + ttlSeconds * 1000;
    const entryData: CampaignProgressMetrics = {
      ...metrics,
      cachedAt: now,
      expiresAt,
      ttlSeconds,
    };

    this.cache.set(key, {
      data: entryData,
      expiresAt,
    });

    return entryData;
  }

  async getOrFetch(
    campaignId: string,
    forceRefresh = false,
    ttlSeconds = this.defaultTtlSeconds
  ): Promise<{ metrics: CampaignProgressMetrics; cacheHit: boolean }> {
    if (!forceRefresh) {
      const cached = this.get(campaignId);
      if (cached) {
        return { metrics: cached, cacheHit: true };
      }
    }

    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const treeCount = campaign.treeCount ?? 0;
    const sponsorCount = campaign.sponsorCount ?? 0;
    const co2PerTreeKg = 20;
    const co2ImpactKg = treeCount * co2PerTreeKg;
    const co2Tonnes = (co2ImpactKg / 1000).toFixed(2);

    const saved = this.set(
      campaignId,
      {
        campaignId,
        treeCount,
        sponsorCount,
        co2ImpactKg,
        co2SequestrationTonnes: campaign.co2Sequestration ?? co2Tonnes,
        raisedAmount: campaign.raisedAmount ?? "0",
        goalAmount: campaign.goalAmount ?? "0",
      },
      ttlSeconds
    );

    return { metrics: saved, cacheHit: false };
  }

  invalidate(campaignId: string): boolean {
    return this.cache.delete(buildCampaignProgressCacheKey(campaignId));
  }

  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  getStats() {
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };
  }
}

export const campaignProgressCache = new CampaignProgressCacheService();
