/**
 * Campaign Progress Caching Layer — issue #976
 *
 * Reduces database query load by caching frequently-accessed campaign progress metrics:
 *   - Tree count
 *   - Sponsor count
 *   - CO2 impact
 *   - Total raised amount
 *
 * # Cache Strategy
 * Uses a cache-aside pattern with a 5-minute TTL (300 seconds) to balance
 * freshness with reduced database load during high traffic periods.
 *
 * # Key Design
 * Keys are namespaced as `campaign:progress:{campaignId}` for individual
 * campaign metrics.
 *
 * # TTL Configuration
 * Default TTL: 300 seconds (5 minutes)
 * Override via: CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS environment variable
 *
 * # Graceful Degradation
 * All methods return `null` on cache miss or Redis unavailability,
 * allowing the caller to fall through to the database without errors.
 *
 * @module campaign-progress-cache
 */

import { getRedisClient, type RedisClient } from "./redis";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Campaign progress metrics cached to reduce database load */
export interface CampaignProgressMetrics {
  /** Unique campaign identifier */
  campaignId: string;
  /** Total number of trees planted */
  treeCount: number;
  /** Total number of unique sponsors/contributors */
  sponsorCount: number;
  /** Total amount raised in token stroops */
  raisedAmount: string;
  /** Calculated CO2 impact in kilograms */
  co2ImpactKg: number;
  /** Unix timestamp (ms) when these metrics were calculated */
  calculatedAt: number;
}

/** Options for cache operations */
export interface CacheOptions {
  /** TTL in seconds. If not provided, uses default from env or 300s */
  ttlSeconds?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_PREFIX = "campaign:progress";
/** Default cache TTL: 5 minutes (300 seconds) */
const DEFAULT_TTL_SECONDS = 300;

// ── Key builders ──────────────────────────────────────────────────────────────

/** Build a cache key for campaign progress metrics */
export function buildProgressKey(campaignId: string): string {
  return `${KEY_PREFIX}:${campaignId}`;
}

/** Build a cache key pattern for bulk invalidation */
export function buildProgressKeyPattern(): string {
  return `${KEY_PREFIX}:*`;
}

// ── Core cache class ──────────────────────────────────────────────────────────

export class CampaignProgressCache {
  constructor(private readonly redis: RedisClient | null) {}

  /**
   * Get the configured TTL in seconds.
   * Reads from CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS env var or uses default.
   */
  private getTTL(options?: CacheOptions): number {
    if (options?.ttlSeconds !== undefined) {
      return options.ttlSeconds;
    }
    const envTTL = process.env.CAMPAIGN_PROGRESS_CACHE_TTL_SECONDS;
    return envTTL ? Number(envTTL) : DEFAULT_TTL_SECONDS;
  }

  /**
   * Retrieve cached progress metrics for a campaign.
   * Returns `null` on cache miss, expiry, or Redis unavailability.
   */
  async get(campaignId: string): Promise<CampaignProgressMetrics | null> {
    if (!this.redis) return null;
    try {
      const key = buildProgressKey(campaignId);
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as CampaignProgressMetrics;
    } catch (err) {
      console.error(
        `[campaign-progress-cache] get error for campaign "${campaignId}":`,
        (err as Error).message
      );
      return null;
    }
  }

  /**
   * Store campaign progress metrics with TTL.
   * Silently no-ops when Redis is unavailable.
   */
  async set(
    metrics: CampaignProgressMetrics,
    options?: CacheOptions
  ): Promise<void> {
    if (!this.redis) return;
    try {
      const key = buildProgressKey(metrics.campaignId);
      const ttl = this.getTTL(options);
      const serialized = JSON.stringify(metrics);
      
      if (ttl > 0) {
        await this.redis.setex(key, ttl, serialized);
      } else {
        await this.redis.set(key, serialized);
      }
    } catch (err) {
      console.error(
        `[campaign-progress-cache] set error for campaign "${metrics.campaignId}":`,
        (err as Error).message
      );
    }
  }

  /**
   * Invalidate cached progress metrics for a specific campaign.
   * Call this when a campaign receives a new contribution, tree is planted,
   * or any other action that affects progress metrics.
   */
  async invalidate(campaignId: string): Promise<void> {
    if (!this.redis) return;
    try {
      const key = buildProgressKey(campaignId);
      await this.redis.del(key);
    } catch (err) {
      console.error(
        `[campaign-progress-cache] invalidate error for campaign "${campaignId}":`,
        (err as Error).message
      );
    }
  }

  /**
   * Invalidate all cached campaign progress metrics.
   * Useful for testing or when performing bulk updates.
   */
  async invalidateAll(): Promise<number> {
    if (!this.redis) return 0;
    let cursor = "0";
    let deleted = 0;
    try {
      const pattern = buildProgressKeyPattern();
      do {
        const [nextCursor, keys] = await this.redis.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          100
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          deleted += await this.redis.del(...keys);
        }
      } while (cursor !== "0");
      return deleted;
    } catch (err) {
      console.error(
        "[campaign-progress-cache] invalidateAll error:",
        (err as Error).message
      );
      return deleted;
    }
  }

  /**
   * Get the remaining TTL for a campaign's cached metrics.
   * Returns -1 if no TTL, -2 if key doesn't exist, null on error.
   */
  async ttl(campaignId: string): Promise<number | null> {
    if (!this.redis) return null;
    try {
      const key = buildProgressKey(campaignId);
      return await this.redis.ttl(key);
    } catch {
      return null;
    }
  }

  /**
   * Bulk get cached metrics for multiple campaigns.
   * Returns a Map of campaignId -> metrics for cache hits only.
   */
  async getMany(
    campaignIds: string[]
  ): Promise<Map<string, CampaignProgressMetrics>> {
    const result = new Map<string, CampaignProgressMetrics>();
    if (!this.redis || campaignIds.length === 0) return result;

    try {
      const keys = campaignIds.map(buildProgressKey);
      const values = await this.redis.mget(...keys);
      
      for (let i = 0; i < values.length; i++) {
        const raw = values[i];
        if (raw !== null) {
          try {
            const metrics = JSON.parse(raw) as CampaignProgressMetrics;
            result.set(campaignIds[i], metrics);
          } catch {
            // Skip invalid JSON
          }
        }
      }
    } catch (err) {
      console.error(
        "[campaign-progress-cache] getMany error:",
        (err as Error).message
      );
    }

    return result;
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _campaignProgressCache: CampaignProgressCache | null = null;

export function getCampaignProgressCache(
  redis?: RedisClient | null
): CampaignProgressCache {
  if (redis !== undefined) return new CampaignProgressCache(redis);
  if (!_campaignProgressCache) {
    _campaignProgressCache = new CampaignProgressCache(getRedisClient());
  }
  return _campaignProgressCache;
}
