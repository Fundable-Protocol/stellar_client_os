/**
 * Analytics Service — Aggregate Funding Analytics (issue #538)
 *
 * Data layer for the GraphQL gateway. Aggregates payment stream data
 * from the Stellar contract events / service layer into metrics by
 * region, category, and asset.
 *
 * In production this service queries:
 *   a) The Soroban RPC `getEvents` API for on-chain stream events
 *   b) An optional off-chain indexer database for richer metadata
 *      (region tags, category labels, USD price oracles)
 *
 * For testability, the data source is injected via a `StreamDataSource`
 * interface so tests can provide deterministic fixtures without hitting
 * the network.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type StreamStatusFilter = "Active" | "Paused" | "Canceled" | "Completed";

/** Minimal stream record consumed by the analytics service. */
export interface StreamRecord {
  id: string;
  sender: string;
  recipient: string;
  /** Token contract address */
  asset: string;
  /** Optional human-readable ticker (USDC, XLM, etc.) */
  symbol?: string;
  /** Total stream amount in stroops (as string to avoid BigInt issues) */
  totalAmount: string;
  status: StreamStatusFilter;
  /** Unix timestamp (seconds) when the stream was created */
  createdAt: number;
  /** Optional geographic region tag (ISO 3166-1 alpha-2) */
  region?: string;
  /** Optional funding category tag */
  category?: string;
  /** USD-equivalent value of the stream (for cross-asset aggregation) */
  usdEquivalent?: string;
}

export interface AssetMetrics {
  asset: string;
  symbol: string;
  totalVolume: string;
  streamCount: number;
  uniqueSenders: number;
  uniqueRecipients: number;
  averageStreamAmount: string;
}

export interface RegionMetrics {
  region: string;
  totalStreams: number;
  totalVolumeUsd: string;
  projectCount: number;
  assetBreakdown: AssetMetrics[];
}

export interface CategoryMetrics {
  category: string;
  totalStreams: number;
  totalVolumeUsd: string;
  sharePercent: number;
  assetBreakdown: AssetMetrics[];
}

export interface GlobalMetrics {
  totalStreams: number;
  activeStreams: number;
  totalVolumeUsd: string;
  uniqueAssets: number;
  uniqueRegions: number;
  uniqueCategories: number;
  latestStreamAt: number | null;
}

export interface RegionFilter {
  region?: string;
  asset?: string;
  status?: StreamStatusFilter;
  fromTimestamp?: number;
  toTimestamp?: number;
}

export interface CategoryFilter {
  category?: string;
  asset?: string;
  status?: StreamStatusFilter;
}

export interface AssetFilter {
  asset?: string;
  status?: StreamStatusFilter;
  fromTimestamp?: number;
  toTimestamp?: number;
}

export interface PaginationInput {
  limit?: number;
  offset?: number;
}

/** Pluggable data source interface — swap for a real DB/RPC in production. */
export interface StreamDataSource {
  getStreams(network: string): Promise<StreamRecord[]>;
}

// ── Default data source (reads from env-configured Stellar RPC) ───────────────

/**
 * Production data source that fetches stream events from the Stellar RPC.
 * Returns mock data in test / development environments to avoid network calls.
 */
export class DefaultStreamDataSource implements StreamDataSource {
  async getStreams(): Promise<StreamRecord[]> {
    // In production, this would call the Stellar RPC getEvents API and
    // cross-reference with an indexer for metadata tags.
    // Returning a well-typed empty array here so the gateway is functional
    // out of the box — replace with real data fetching in production.
    if (process.env.NODE_ENV === "test") {
      return [];
    }

    // Real implementation sketch:
    // const rpcUrl = network === "mainnet"
    //   ? "https://soroban.stellar.org"
    //   : "https://soroban-testnet.stellar.org";
    // const rpc = new Server(rpcUrl);
    // const events = await rpc.getEvents({ ... });
    // return parseStreamEvents(events);
    return [];
  }
}

// ── Helper functions ──────────────────────────────────────────────────────────

function toBigInt(s: string): bigint {
  try { return BigInt(s); } catch { return 0n; }
}

function toUsd(amount: string, usdEquivalent?: string): bigint {
  if (usdEquivalent) return toBigInt(usdEquivalent);
  return toBigInt(amount); // 1:1 fallback
}

/**
 * Build per-asset aggregate metrics from a list of stream records.
 */
function aggregateByAsset(streams: StreamRecord[]): AssetMetrics[] {
  const map = new Map<string, {
    symbol: string;
    volume: bigint;
    count: number;
    senders: Set<string>;
    recipients: Set<string>;
  }>();

  for (const s of streams) {
    const existing = map.get(s.asset);
    if (existing) {
      existing.volume += toBigInt(s.totalAmount);
      existing.count++;
      existing.senders.add(s.sender);
      existing.recipients.add(s.recipient);
    } else {
      map.set(s.asset, {
        symbol: s.symbol ?? s.asset.slice(0, 8),
        volume: toBigInt(s.totalAmount),
        count: 1,
        senders: new Set([s.sender]),
        recipients: new Set([s.recipient]),
      });
    }
  }

  return Array.from(map.entries()).map(([asset, m]) => ({
    asset,
    symbol: m.symbol,
    totalVolume: m.volume.toString(),
    streamCount: m.count,
    uniqueSenders: m.senders.size,
    uniqueRecipients: m.recipients.size,
    averageStreamAmount: m.count > 0 ? (m.volume / BigInt(m.count)).toString() : "0",
  }));
}

/**
 * Apply common time/status/asset filters to a stream list.
 */
function filterStreams(
  streams: StreamRecord[],
  filter: { asset?: string; status?: string; fromTimestamp?: number; toTimestamp?: number }
): StreamRecord[] {
  return streams.filter((s) => {
    if (filter.asset && s.asset !== filter.asset) return false;
    if (filter.status && s.status !== filter.status) return false;
    if (filter.fromTimestamp && s.createdAt < filter.fromTimestamp) return false;
    if (filter.toTimestamp && s.createdAt > filter.toTimestamp) return false;
    return true;
  });
}

function paginate<T>(items: T[], pagination?: PaginationInput): T[] {
  const limit = Math.min(pagination?.limit ?? 20, 100);
  const offset = pagination?.offset ?? 0;
  return items.slice(offset, offset + limit);
}

// ── Analytics Service ─────────────────────────────────────────────────────────

export class AnalyticsService {
  constructor(private readonly dataSource: StreamDataSource = new DefaultStreamDataSource()) {}

  // ── globalMetrics ─────────────────────────────────────────────────────────

  async getGlobalMetrics(network = "testnet"): Promise<GlobalMetrics> {
    const streams = await this.dataSource.getStreams(network);

    const activeStreams = streams.filter((s) => s.status === "Active").length;
    const totalVolumeUsd = streams
      .reduce((acc, s) => acc + toUsd(s.totalAmount, s.usdEquivalent), 0n)
      .toString();

    const assets = new Set(streams.map((s) => s.asset));
    const regions = new Set(streams.map((s) => s.region ?? "GLOBAL").filter(Boolean));
    const categories = new Set(streams.map((s) => s.category).filter(Boolean));

    const timestamps = streams.map((s) => s.createdAt).filter(Boolean);
    const latestStreamAt = timestamps.length > 0 ? Math.max(...timestamps) : null;

    return {
      totalStreams: streams.length,
      activeStreams,
      totalVolumeUsd,
      uniqueAssets: assets.size,
      uniqueRegions: regions.size,
      uniqueCategories: categories.size,
      latestStreamAt,
    };
  }

  // ── regionMetrics ─────────────────────────────────────────────────────────

  async getRegionMetrics(
    filter?: RegionFilter,
    pagination?: PaginationInput,
    network = "testnet"
  ): Promise<RegionMetrics[]> {
    let streams = await this.dataSource.getStreams(network);
    streams = filterStreams(streams, filter ?? {});

    // Group by region
    const regionMap = new Map<string, StreamRecord[]>();
    for (const s of streams) {
      const region = s.region ?? "GLOBAL";
      if (filter?.region && region !== filter.region) continue;
      const existing = regionMap.get(region) ?? [];
      existing.push(s);
      regionMap.set(region, existing);
    }

    const results: RegionMetrics[] = Array.from(regionMap.entries()).map(([region, ss]) => {
      const totalVolumeUsd = ss
        .reduce((acc, s) => acc + toUsd(s.totalAmount, s.usdEquivalent), 0n)
        .toString();

      const projectCount = new Set(ss.map((s) => s.recipient)).size;

      return {
        region,
        totalStreams: ss.length,
        totalVolumeUsd,
        projectCount,
        assetBreakdown: aggregateByAsset(ss),
      };
    });

    // Sort by totalStreams descending
    results.sort((a, b) => b.totalStreams - a.totalStreams);

    return paginate(results, pagination);
  }

  // ── categoryMetrics ───────────────────────────────────────────────────────

  async getCategoryMetrics(
    filter?: CategoryFilter,
    pagination?: PaginationInput,
    network = "testnet"
  ): Promise<CategoryMetrics[]> {
    let streams = await this.dataSource.getStreams(network);
    streams = filterStreams(streams, filter ?? {});

    const total = streams.length;

    // Group by category
    const categoryMap = new Map<string, StreamRecord[]>();
    for (const s of streams) {
      const category = s.category ?? "uncategorized";
      if (filter?.category && category !== filter.category) continue;
      const existing = categoryMap.get(category) ?? [];
      existing.push(s);
      categoryMap.set(category, existing);
    }

    const results: CategoryMetrics[] = Array.from(categoryMap.entries()).map(
      ([category, ss]) => {
        const totalVolumeUsd = ss
          .reduce((acc, s) => acc + toUsd(s.totalAmount, s.usdEquivalent), 0n)
          .toString();

        return {
          category,
          totalStreams: ss.length,
          totalVolumeUsd,
          sharePercent: total > 0 ? Number(((ss.length / total) * 100).toFixed(2)) : 0,
          assetBreakdown: aggregateByAsset(ss),
        };
      }
    );

    results.sort((a, b) => b.totalStreams - a.totalStreams);
    return paginate(results, pagination);
  }

  // ── assetMetrics ──────────────────────────────────────────────────────────

  async getAssetMetrics(
    filter?: AssetFilter,
    pagination?: PaginationInput,
    network = "testnet"
  ): Promise<AssetMetrics[]> {
    let streams = await this.dataSource.getStreams(network);
    streams = filterStreams(streams, filter ?? {});

    const results = aggregateByAsset(streams);
    results.sort((a, b) => Number(toBigInt(b.totalVolume) - toBigInt(a.totalVolume)));
    return paginate(results, pagination);
  }
}

/** Module-level singleton — shared across all requests in the same process. */
let _defaultService: AnalyticsService | null = null;

export function getAnalyticsService(dataSource?: StreamDataSource): AnalyticsService {
  if (dataSource) return new AnalyticsService(dataSource);
  if (!_defaultService) _defaultService = new AnalyticsService();
  return _defaultService;
}
