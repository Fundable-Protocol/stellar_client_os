/**
 * GraphQL Schema — Aggregate Funding Analytics Gateway (issue #538)
 *
 * Exposes aggregate payment stream metrics queryable by region, category,
 * and asset (token). All monetary amounts are returned as strings to avoid
 * JavaScript BigInt serialisation issues.
 */

export const typeDefs = /* GraphQL */ `
  """Supported Stellar network."""
  enum Network {
    testnet
    mainnet
  }

  """Status of a payment stream."""
  enum StreamStatus {
    Active
    Paused
    Canceled
    Completed
  }

  """Aggregated metrics for a single asset (token)."""
  type AssetMetrics {
    """Token contract address (C… Stellar address)."""
    asset: String!
    """Human-readable ticker symbol if known, otherwise the asset address."""
    symbol: String!
    """Total volume streamed in the asset's stroops (as string)."""
    totalVolume: String!
    """Number of individual payment streams using this asset."""
    streamCount: Int!
    """Number of unique sender addresses."""
    uniqueSenders: Int!
    """Number of unique recipient addresses."""
    uniqueRecipients: Int!
    """Average stream amount in stroops (as string)."""
    averageStreamAmount: String!
  }

  """Aggregated metrics for a geographic region."""
  type RegionMetrics {
    """ISO 3166-1 alpha-2 region code (e.g. 'NG', 'GH') or 'GLOBAL'."""
    region: String!
    """Total number of streams in this region."""
    totalStreams: Int!
    """Total volume across all assets (normalised to USDC-equivalent, as string)."""
    totalVolumeUsd: String!
    """Number of unique funded projects in this region."""
    projectCount: Int!
    """Per-asset breakdown."""
    assetBreakdown: [AssetMetrics!]!
  }

  """Aggregated metrics for a funding category."""
  type CategoryMetrics {
    """Category label (e.g. 'climate', 'education', 'health')."""
    category: String!
    """Total number of streams in this category."""
    totalStreams: Int!
    """Total volume in USDC-equivalent (as string)."""
    totalVolumeUsd: String!
    """Percentage of all streams that fall into this category (0–100)."""
    sharePercent: Float!
    """Per-asset breakdown within this category."""
    assetBreakdown: [AssetMetrics!]!
  }

  """Top-level aggregate across all streams."""
  type GlobalMetrics {
    """Total number of streams ever created."""
    totalStreams: Int!
    """Total active streams right now."""
    activeStreams: Int!
    """Total volume across all assets and regions (USDC-equivalent, as string)."""
    totalVolumeUsd: String!
    """Number of distinct asset types used."""
    uniqueAssets: Int!
    """Number of distinct regions represented."""
    uniqueRegions: Int!
    """Number of distinct categories represented."""
    uniqueCategories: Int!
    """Unix timestamp (seconds) of the most recently created stream."""
    latestStreamAt: Int
  }

  """Pagination arguments for list queries."""
  input PaginationInput {
    """Maximum number of items to return (default 20, max 100)."""
    limit: Int
    """Zero-based offset for the result set (default 0)."""
    offset: Int
  }

  """Filter arguments for region metrics."""
  input RegionFilter {
    """Return only this region (ISO 3166-1 alpha-2). Omit for all regions."""
    region: String
    """Return only streams for this asset address. Omit for all assets."""
    asset: String
    """Return only streams matching this status. Omit for all statuses."""
    status: StreamStatus
    """Return streams created at or after this Unix timestamp (seconds)."""
    fromTimestamp: Int
    """Return streams created at or before this Unix timestamp (seconds)."""
    toTimestamp: Int
  }

  """Filter arguments for category metrics."""
  input CategoryFilter {
    """Return only this category. Omit for all categories."""
    category: String
    """Return only streams for this asset address. Omit for all assets."""
    asset: String
    """Return only streams matching this status. Omit for all statuses."""
    status: StreamStatus
  }

  """Filter arguments for asset metrics."""
  input AssetFilter {
    """Return only this asset address. Omit for all assets."""
    asset: String
    """Return only streams matching this status. Omit for all statuses."""
    status: StreamStatus
    """Return streams created at or after this Unix timestamp (seconds)."""
    fromTimestamp: Int
    """Return streams created at or before this Unix timestamp (seconds)."""
    toTimestamp: Int
  }

  type Query {
    """
    Global aggregate metrics across all streams on the specified network.
    """
    globalMetrics(network: Network): GlobalMetrics!

    """
    Aggregate metrics broken down by geographic region.
    Regions are derived from stream metadata tags.
    """
    regionMetrics(
      filter: RegionFilter
      pagination: PaginationInput
      network: Network
    ): [RegionMetrics!]!

    """
    Aggregate metrics broken down by funding category.
    Categories are derived from stream metadata tags.
    """
    categoryMetrics(
      filter: CategoryFilter
      pagination: PaginationInput
      network: Network
    ): [CategoryMetrics!]!

    """
    Aggregate metrics broken down by asset (token contract address).
    """
    assetMetrics(
      filter: AssetFilter
      pagination: PaginationInput
      network: Network
    ): [AssetMetrics!]!
  }
`;
