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

export class CampaignProgressCacheService {
  private cache = new Map<string, CacheEntry>();
  private defaultTtlSeconds = 300; // 5 minutes
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor(defaultTtlSeconds = 300) {
    this.defaultTtlSeconds = defaultTtlSeconds;
  }

  get(campaignId: string): CampaignProgressMetrics | null {
    const entry = this.cache.get(campaignId);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(campaignId);
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
    const now = Date.now();
    const expiresAt = now + ttlSeconds * 1000;
    const entryData: CampaignProgressMetrics = {
      ...metrics,
      cachedAt: now,
      expiresAt,
      ttlSeconds,
    };

    this.cache.set(campaignId, {
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
    return this.cache.delete(campaignId);
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