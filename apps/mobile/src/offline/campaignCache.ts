/**
 * Persisted campaign cache + read-through repository.
 *
 * `CampaignRepository.loadList` / `loadDetail` try the network first and fall
 * back to the last cached payload when the fetch fails, so a sponsor can keep
 * browsing campaigns while offline. Successful fetches refresh the cache.
 */

import { type KeyValueStorage, readJSON, writeJSON } from "./storage";
import type {
  CachedValue,
  CampaignDetail,
  CampaignSummary,
} from "./types";

export interface CampaignCacheOptions {
  /** Storage key prefix, override to run isolated caches (e.g. per account). */
  namespace?: string;
  /** Injectable clock, defaults to `Date.now`. */
  clock?: () => number;
}

export class CampaignCache<
  TList = CampaignSummary[],
  TDetail = CampaignDetail,
> {
  private readonly namespace: string;
  private readonly clock: () => number;

  constructor(
    private readonly storage: KeyValueStorage,
    options: CampaignCacheOptions = {},
  ) {
    this.namespace = options.namespace ?? "fundable.offline.cache";
    this.clock = options.clock ?? Date.now;
  }

  /** Storage key for the cached campaign list. */
  listKey(): string {
    return `${this.namespace}.campaigns.list`;
  }

  /** Storage key for a cached campaign detail. */
  detailKey(campaignId: string): string {
    return `${this.namespace}.campaigns.detail.${campaignId}`;
  }

  async saveList(campaigns: TList): Promise<void> {
    await writeJSON<CachedValue<TList>>(this.storage, this.listKey(), {
      data: campaigns,
      cachedAt: this.clock(),
    });
  }

  async readList(): Promise<CachedValue<TList> | null> {
    return readJSON<CachedValue<TList>>(this.storage, this.listKey());
  }

  async saveDetail(campaignId: string, detail: TDetail): Promise<void> {
    await writeJSON<CachedValue<TDetail>>(
      this.storage,
      this.detailKey(campaignId),
      { data: detail, cachedAt: this.clock() },
    );
  }

  async readDetail(campaignId: string): Promise<CachedValue<TDetail> | null> {
    return readJSON<CachedValue<TDetail>>(
      this.storage,
      this.detailKey(campaignId),
    );
  }

  /** Remove every cache entry owned by this namespace. */
  async clear(): Promise<void> {
    if (!this.storage.getAllKeys) return;
    const prefix = `${this.namespace}.campaigns.`;
    const keys = await this.storage.getAllKeys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(prefix))
        .map((key) => this.storage.removeItem(key)),
    );
  }
}

/** Result of a read-through load, indicating whether it came from cache. */
export interface ReadResult<T> {
  data: T;
  fromCache: boolean;
  cachedAt: number | null;
}

export type Fetcher<T> = () => Promise<T>;

export interface LoadOptions<T> {
  /**
   * Value returned when the network fails and nothing is cached. When omitted,
   * the original network error is re-thrown (useful for detail screens that
   * must show an error state).
   */
  fallback?: T;
}

export class CampaignRepository<
  TList = CampaignSummary[],
  TDetail = CampaignDetail,
> {
  constructor(private readonly cache: CampaignCache<TList, TDetail>) {}

  /**
   * Network-first read of the campaign list. On failure, serve the cached list
   * (offline browse). When nothing is cached and no `fallback` is given, the
   * original error propagates.
   */
  async loadList(
    fetchList: Fetcher<TList>,
    options: LoadOptions<TList> = {},
  ): Promise<ReadResult<TList>> {
    try {
      const fresh = await fetchList();
      await this.cache.saveList(fresh);
      return { data: fresh, fromCache: false, cachedAt: null };
    } catch (error) {
      const cached = await this.cache.readList();
      if (cached) {
        return { data: cached.data, fromCache: true, cachedAt: cached.cachedAt };
      }
      if (Object.prototype.hasOwnProperty.call(options, "fallback")) {
        return {
          data: options.fallback as TList,
          fromCache: true,
          cachedAt: null,
        };
      }
      throw error;
    }
  }

  /** Network-first read of a campaign detail with the same offline fallback. */
  async loadDetail(
    campaignId: string,
    fetchDetail: Fetcher<TDetail>,
    options: LoadOptions<TDetail> = {},
  ): Promise<ReadResult<TDetail>> {
    try {
      const fresh = await fetchDetail();
      await this.cache.saveDetail(campaignId, fresh);
      return { data: fresh, fromCache: false, cachedAt: null };
    } catch (error) {
      const cached = await this.cache.readDetail(campaignId);
      if (cached) {
        return { data: cached.data, fromCache: true, cachedAt: cached.cachedAt };
      }
      if (Object.prototype.hasOwnProperty.call(options, "fallback")) {
        return {
          data: options.fallback as TDetail,
          fromCache: true,
          cachedAt: null,
        };
      }
      throw error;
    }
  }
}
