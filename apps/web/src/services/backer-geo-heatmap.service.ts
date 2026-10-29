import type {
  BackerGeoDataPoint,
  BackerGeoEvent,
  BackerGeoHeatMapResult,
  BackerGeoQueryFilters,
  CountryCode,
  TierLabel,
} from "@/types/backer-geo-heatmap";

interface StoredEvent {
  countryCode: CountryCode;
  countryName: string;
  pledgedXlm: bigint;
  tierLabel: TierLabel | null;
  pledgedAt: Date;
}

/**
 * In-memory service for backer geographic heat-map analytics (Issue #1339).
 *
 * Stores aggregated, anonymised pledge events keyed by campaign.
 * No backer wallet addresses or IP addresses are ever stored.
 */
export class BackerGeoHeatMapService {
  private events: Map<string, StoredEvent[]> = new Map();

  // ---------------------------------------------------------------------------
  // Ingestion
  // ---------------------------------------------------------------------------

  /**
   * Records an anonymised pledge event.
   * countryCode must be a valid ISO 3166-1 alpha-2 code.
   */
  public recordPledgeEvent(event: BackerGeoEvent): void {
    const code = event.countryCode?.trim().toUpperCase();
    if (!code || code.length !== 2) {
      throw new Error("countryCode must be a 2-letter ISO 3166-1 alpha-2 code");
    }
    if (!event.countryName?.trim()) {
      throw new Error("countryName is required");
    }

    const pledgedXlm = parsePledgedXlm(event.pledgedXlm);

    const stored: StoredEvent = {
      countryCode: code,
      countryName: event.countryName.trim(),
      pledgedXlm,
      tierLabel: event.tierLabel?.trim() || null,
      pledgedAt: new Date(event.pledgedAt),
    };

    const list = this.events.get(event.campaignId) ?? [];
    list.push(stored);
    this.events.set(event.campaignId, list);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /**
   * Returns the aggregated heat-map data for a campaign, optionally filtered
   * by pledge tier and/or date range.
   */
  public getHeatMap(
    campaignId: string,
    filters: BackerGeoQueryFilters = {},
  ): BackerGeoHeatMapResult {
    const allEvents = this.events.get(campaignId) ?? [];
    const filtered = applyFilters(allEvents, filters);

    // Aggregate by country
    const countryMap = new Map<CountryCode, { countryName: string; backerCount: number; totalPledgedXlm: bigint }>();

    for (const evt of filtered) {
      const existing = countryMap.get(evt.countryCode);
      if (existing) {
        existing.backerCount += 1;
        existing.totalPledgedXlm += evt.pledgedXlm;
      } else {
        countryMap.set(evt.countryCode, {
          countryName: evt.countryName,
          backerCount: 1,
          totalPledgedXlm: evt.pledgedXlm,
        });
      }
    }

    const totalBackers = filtered.length;

    const data: BackerGeoDataPoint[] = Array.from(countryMap.entries())
      .map(([countryCode, agg]) => ({
        countryCode,
        countryName: agg.countryName,
        backerCount: agg.backerCount,
        totalPledgedXlm: agg.totalPledgedXlm.toString(),
        sharePercent:
          totalBackers > 0
            ? Math.round((agg.backerCount / totalBackers) * 10_000) / 100
            : 0,
      }))
      .sort((a, b) => b.backerCount - a.backerCount);

    return {
      campaignId,
      data,
      filters: {
        tierLabel: filters.tierLabel ?? null,
        fromDate: filters.fromDate ?? null,
        toDate: filters.toDate ?? null,
      },
      generatedAt: new Date().toISOString(),
      totalBackers,
    };
  }

  /** Returns unique tier labels seen for a campaign (useful for filter UI). */
  public getAvailableTiers(campaignId: string): TierLabel[] {
    const all = this.events.get(campaignId) ?? [];
    const tiers = new Set<TierLabel>();
    for (const evt of all) {
      if (evt.tierLabel) tiers.add(evt.tierLabel);
    }
    return Array.from(tiers).sort();
  }

  /** Clears all events for a campaign (useful for testing). */
  public clearCampaignData(campaignId: string): void {
    this.events.delete(campaignId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePledgedXlm(value: string): bigint {
  const trimmed = value?.trim();
  if (!trimmed) throw new Error("pledgedXlm is required");
  // Accept "100", "100.5", "100 XLM" etc.
  const numeric = trimmed.replace(/[^0-9.]/g, "");
  const parsed = Math.round(parseFloat(numeric) * 1_000_000); // store as stroops
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid pledgedXlm value: ${value}`);
  }
  return BigInt(parsed);
}

function applyFilters(events: StoredEvent[], filters: BackerGeoQueryFilters): StoredEvent[] {
  let result = events;

  if (filters.tierLabel) {
    const label = filters.tierLabel.trim().toLowerCase();
    result = result.filter((e) => e.tierLabel?.toLowerCase() === label);
  }

  if (filters.fromDate) {
    const from = new Date(filters.fromDate).getTime();
    if (!Number.isNaN(from)) {
      result = result.filter((e) => e.pledgedAt.getTime() >= from);
    }
  }

  if (filters.toDate) {
    const to = new Date(filters.toDate).getTime();
    if (!Number.isNaN(to)) {
      result = result.filter((e) => e.pledgedAt.getTime() <= to);
    }
  }

  return result;
}

export const backerGeoHeatMapService = new BackerGeoHeatMapService();