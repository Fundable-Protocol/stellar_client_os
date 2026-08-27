/**
 * Redis Caching Layer for Spatial Geo-Queries & Stream Aggregates — issue #532
 *
 * Provides cache-aside helpers for:
 *   1. Bounding-box geo-queries (streams visible in a map viewport)
 *   2. Point-radius geo-queries (streams within N km of a coordinate)
 *   3. Stream aggregate summaries (count, total volume, etc.)
 *   4. Individual stream detail records
 *
 * # Cache-key design
 * Keys are namespaced by query type and a deterministic string derived
 * from the query parameters. Bounding-box coordinates are rounded to
 * GEO_PRECISION decimal places (default 4 ≈ 11 m) so nearby identical
 * queries share a cache entry.
 *
 * # TTL strategy
 * | Query type        | Default TTL | Env var override              |
 * |-------------------|-------------|-------------------------------|
 * | Bounding-box      | 30 s        | GEO_CACHE_BBOX_TTL_SECONDS    |
 * | Point-radius      | 60 s        | GEO_CACHE_RADIUS_TTL_SECONDS  |
 * | Stream aggregates | 120 s       | GEO_CACHE_AGGS_TTL_SECONDS    |
 * | Stream detail     | 300 s       | GEO_CACHE_DETAIL_TTL_SECONDS  |
 *
 * # Graceful degradation
 * Every method returns `null` (cache miss) when Redis is unavailable
 * instead of throwing, so the calling code falls through to the data
 * source without any change in observable behaviour.
 *
 * @module geo-cache
 */

import { getRedisClient, type RedisClient } from "./redis";

// ── Types ─────────────────────────────────────────────────────────────────────

/** Geographic bounding box (WGS-84 coordinates). */
export interface BoundingBox {
  /** South-west corner */
  swLat: number;
  swLng: number;
  /** North-east corner */
  neLat: number;
  neLng: number;
}

/** Point-radius query parameters. */
export interface RadiusQuery {
  lat: number;
  lng: number;
  /** Search radius in kilometres */
  radiusKm: number;
}

/** A single stream location record. */
export interface StreamLocation {
  id: string;
  lat: number;
  lng: number;
  /** Stellar address of the stream creator */
  sender: string;
  /** Stellar address of the recipient */
  recipient: string;
  /** Token ticker (e.g. "USDC") */
  token: string;
  /** Amount in the token's native units */
  amount: string;
  status: "active" | "completed" | "cancelled" | "paused";
  createdAt: number;
  /** Optional project metadata */
  projectName?: string;
  /** Optional category tag */
  category?: string;
}

/** Aggregated statistics for a set of streams. */
export interface StreamAggregates {
  totalStreams: number;
  activeStreams: number;
  totalVolumeUsd: string;
  uniqueSenders: number;
  uniqueRecipients: number;
  /** ISO 8601 timestamp of most recent stream */
  latestStreamAt: string | null;
  /** Per-token breakdown */
  tokenBreakdown: Array<{
    token: string;
    count: number;
    totalAmount: string;
  }>;
}

/** Generic cache result with metadata. */
export interface CacheResult<T> {
  data: T;
  /** Whether this data came from the cache */
  fromCache: boolean;
  /** Unix timestamp (ms) when this entry expires, or null if unknown */
  expiresAt: number | null;
}

/** Options for individual cache operations. */
export interface CacheSetOptions {
  /** TTL in seconds. 0 means no expiry. */
  ttlSeconds?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const KEY_PREFIX = "geo";
/** Decimal places to round coordinates to for cache key normalisation */
const GEO_PRECISION = 4;

const DEFAULT_TTL = {
  bbox: 30,
  radius: 60,
  aggregates: 120,
  detail: 300,
} as const;

// ── Key builders ──────────────────────────────────────────────────────────────

function round(n: number, precision = GEO_PRECISION): number {
  const factor = Math.pow(10, precision);
  return Math.round(n * factor) / factor;
}

/**
 * Build a deterministic cache key for a bounding-box query.
 * Coordinates are rounded to GEO_PRECISION decimal places.
 */
export function buildBboxKey(bbox: BoundingBox, filters?: Record<string, string>): string {
  const parts = [
    `${KEY_PREFIX}:bbox`,
    round(bbox.swLat),
    round(bbox.swLng),
    round(bbox.neLat),
    round(bbox.neLng),
  ];
  if (filters && Object.keys(filters).length > 0) {
    const sorted = Object.keys(filters)
      .sort()
      .map((k) => `${k}:${filters[k]}`)
      .join(",");
    parts.push(sorted);
  }
  return parts.join(":");
}

/**
 * Build a deterministic cache key for a point-radius query.
 */
export function buildRadiusKey(query: RadiusQuery, filters?: Record<string, string>): string {
  const parts = [
    `${KEY_PREFIX}:radius`,
    round(query.lat),
    round(query.lng),
    query.radiusKm.toFixed(1),
  ];
  if (filters && Object.keys(filters).length > 0) {
    const sorted = Object.keys(filters)
      .sort()
      .map((k) => `${k}:${filters[k]}`)
      .join(",");
    parts.push(sorted);
  }
  return parts.join(":");
}

/**
 * Build a cache key for stream aggregate stats.
 * `scope` identifies the aggregation level (e.g. "global", "NG", "climate").
 */
export function buildAggregatesKey(scope: string): string {
  return `${KEY_PREFIX}:aggs:${scope}`;
}

/** Build a cache key for a single stream detail record. */
export function buildDetailKey(streamId: string): string {
  return `${KEY_PREFIX}:detail:${streamId}`;
}

// ── Core cache class ──────────────────────────────────────────────────────────

export class GeoCache {
  constructor(private readonly redis: RedisClient | null) {}

  // ── Generic get/set/delete ────────────────────────────────────────────────

  /**
   * Retrieve a cached value by key.
   * Returns `null` on cache miss, expiry, or Redis unavailability.
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.redis) return null;
    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (err) {
      console.error(`[geo-cache] get error for key "${key}":`, (err as Error).message);
      return null;
    }
  }

  /**
   * Store a value under `key` with an optional TTL.
   * Silently no-ops when Redis is unavailable.
   */
  async set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void> {
    if (!this.redis) return;
    try {
      const serialised = JSON.stringify(value);
      const ttl = options?.ttlSeconds;
      if (ttl && ttl > 0) {
        await this.redis.setex(key, ttl, serialised);
      } else {
        await this.redis.set(key, serialised);
      }
    } catch (err) {
      console.error(`[geo-cache] set error for key "${key}":`, (err as Error).message);
    }
  }

  /**
   * Delete one or more keys.
   * Returns the number of keys that were actually deleted.
   */
  async delete(...keys: string[]): Promise<number> {
    if (!this.redis || keys.length === 0) return 0;
    try {
      return await this.redis.del(...keys);
    } catch (err) {
      console.error("[geo-cache] delete error:", (err as Error).message);
      return 0;
    }
  }

  /**
   * Delete all keys matching a pattern using SCAN (non-blocking).
   * Returns the number of keys deleted.
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!this.redis) return 0;
    let cursor = "0";
    let deleted = 0;
    try {
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
    } catch (err) {
      console.error(`[geo-cache] deletePattern error for "${pattern}":`, (err as Error).message);
    }
    return deleted;
  }

  /**
   * Returns the remaining TTL of a key in seconds.
   * Returns -1 if the key has no TTL, -2 if it does not exist, null on error.
   */
  async ttl(key: string): Promise<number | null> {
    if (!this.redis) return null;
    try {
      return await this.redis.ttl(key);
    } catch {
      return null;
    }
  }

  // ── Domain-specific helpers ───────────────────────────────────────────────

  /**
   * Get cached stream locations for a bounding-box query.
   */
  async getBboxStreams(
    bbox: BoundingBox,
    filters?: Record<string, string>
  ): Promise<StreamLocation[] | null> {
    return this.get<StreamLocation[]>(buildBboxKey(bbox, filters));
  }

  /**
   * Cache stream locations for a bounding-box query.
   */
  async setBboxStreams(
    bbox: BoundingBox,
    streams: StreamLocation[],
    filters?: Record<string, string>,
    ttlSeconds?: number
  ): Promise<void> {
    const ttl =
      ttlSeconds ??
      Number(process.env.GEO_CACHE_BBOX_TTL_SECONDS ?? DEFAULT_TTL.bbox);
    return this.set(buildBboxKey(bbox, filters), streams, { ttlSeconds: ttl });
  }

  /**
   * Get cached stream locations for a point-radius query.
   */
  async getRadiusStreams(
    query: RadiusQuery,
    filters?: Record<string, string>
  ): Promise<StreamLocation[] | null> {
    return this.get<StreamLocation[]>(buildRadiusKey(query, filters));
  }

  /**
   * Cache stream locations for a point-radius query.
   */
  async setRadiusStreams(
    query: RadiusQuery,
    streams: StreamLocation[],
    filters?: Record<string, string>,
    ttlSeconds?: number
  ): Promise<void> {
    const ttl =
      ttlSeconds ??
      Number(process.env.GEO_CACHE_RADIUS_TTL_SECONDS ?? DEFAULT_TTL.radius);
    return this.set(buildRadiusKey(query, filters), streams, { ttlSeconds: ttl });
  }

  /**
   * Get cached stream aggregate stats for `scope`.
   */
  async getAggregates(scope: string): Promise<StreamAggregates | null> {
    return this.get<StreamAggregates>(buildAggregatesKey(scope));
  }

  /**
   * Cache stream aggregate stats for `scope`.
   */
  async setAggregates(
    scope: string,
    aggregates: StreamAggregates,
    ttlSeconds?: number
  ): Promise<void> {
    const ttl =
      ttlSeconds ??
      Number(process.env.GEO_CACHE_AGGS_TTL_SECONDS ?? DEFAULT_TTL.aggregates);
    return this.set(buildAggregatesKey(scope), aggregates, { ttlSeconds: ttl });
  }

  /**
   * Get a single cached stream detail record.
   */
  async getDetail(streamId: string): Promise<StreamLocation | null> {
    return this.get<StreamLocation>(buildDetailKey(streamId));
  }

  /**
   * Cache a single stream detail record.
   */
  async setDetail(
    streamId: string,
    stream: StreamLocation,
    ttlSeconds?: number
  ): Promise<void> {
    const ttl =
      ttlSeconds ??
      Number(process.env.GEO_CACHE_DETAIL_TTL_SECONDS ?? DEFAULT_TTL.detail);
    return this.set(buildDetailKey(streamId), stream, { ttlSeconds: ttl });
  }

  /**
   * Invalidate all geo-cache entries for a region.
   * Call when streams in a viewport are created/updated/cancelled.
   */
  async invalidateGeoCache(): Promise<number> {
    return this.deletePattern(`${KEY_PREFIX}:bbox:*`);
  }

  /**
   * Invalidate a specific stream's detail and all aggregate caches.
   */
  async invalidateStream(streamId: string): Promise<void> {
    await Promise.all([
      this.delete(buildDetailKey(streamId)),
      this.deletePattern(`${KEY_PREFIX}:aggs:*`),
    ]);
  }
}

// ── Singleton factory ─────────────────────────────────────────────────────────

let _geoCache: GeoCache | null = null;

export function getGeoCache(redis?: RedisClient | null): GeoCache {
  if (redis !== undefined) return new GeoCache(redis);
  if (!_geoCache) {
    // redis.ts has no import of this module, so a top-level import is safe.
    _geoCache = new GeoCache(getRedisClient());
  }
  return _geoCache;
}
