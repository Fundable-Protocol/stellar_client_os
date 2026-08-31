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

  """
  Leaderboard bucket for a sponsor based on their impact percentile
  (e.g. 'top_10' means the sponsor ranks in the top 10% of all sponsors).
  """
  enum RankingBand {
    top_1
    top_5
    top_10
    top_25
    top_50
    below_average
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

  """
  A single sponsor's impact compared with the global average sponsor.
  CO2 figures are estimates derived from funded volume (see co2PerUsdKg).
  """
  type SponsorImpact {
    """The sponsor's Stellar address."""
    address: String!
    """Total volume funded by this sponsor (USDC-equivalent, as string)."""
    myVolumeUsd: String!
    """Estimated CO2 offset from this sponsor's funding (kg CO2e)."""
    myCo2OffsetKg: Float!
    """Average volume funded per sponsor (USDC-equivalent, as string)."""
    globalAverageVolumeUsd: String!
    """Estimated CO2 offset of the average sponsor (kg CO2e)."""
    globalAverageCo2OffsetKg: Float!
    """Number of unique sponsors (senders) in the dataset."""
    globalSponsorCount: Int!
    """
    Percentage of sponsors this sponsor beats (0–100).
    Null when there is no sponsor data to compare against.
    """
    percentile: Int
    """Ranking band (e.g. top_10). Null when there is no data."""
    rankingBand: RankingBand
    """CO2 conversion factor applied (kg CO2e per 1 USD funded)."""
    co2PerUsdKg: Float!
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

  enum CampaignStatus {
    DRAFT
    PENDING_VERIFICATION
    ACTIVE
    PAUSED
    COMPLETED
    FAILED
  }

  enum CampaignSortField {
    createdAt
    updatedAt
    name
    status
    goalAmount
    raisedAmount
    sponsorCount
    treeCount
  }

  enum SortDirection {
    ASC
    DESC
  }

  input CampaignFilter {
    status: CampaignStatus
    creator: String
    search: String
    minGoalAmount: String
    maxGoalAmount: String
    createdAfter: Int
    createdBefore: Int
  }

  input CampaignSort {
    field: CampaignSortField
    direction: SortDirection
  }

  type CampaignSponsor {
    id: ID!
    campaignId: ID!
    address: String!
    amount: String!
    token: String!
    sponsoredAt: Int!
  }

  type CampaignStatusHistory {
    id: ID!
    campaignId: ID!
    fromStatus: CampaignStatus
    toStatus: CampaignStatus!
    changedBy: String!
    changedAt: Int!
    reason: String
  }

  type CampaignVerification {
    emailVerified: Boolean!
    phoneVerified: Boolean!
    addressVerified: Boolean!
    badges: [String!]!
    status: String!
    isVerified: Boolean!
    verifiedCount: Int!
    totalCount: Int!
  }

  type CampaignRiskAssessment {
    score: Int!
    level: String!
    redFlags: [String!]!
    reasons: [String!]!
    flagged: Boolean!
  }

  type CampaignHealthBreakdown {
    descriptionQuality: Int!
    creatorHistory: Int!
    responseTime: Int!
    backerFeedback: Int!
  }

  type CampaignHealthAssessment {
    score: Int!
    level: String!
    breakdown: CampaignHealthBreakdown!
  }

  type Campaign {
    id: ID!
    creator: String!
    name: String!
    description: String
    status: CampaignStatus!
    goalAmount: String!
    raisedAmount: String!
    sponsorCount: Int!
    treeCount: Int!
    createdAt: Int!
    updatedAt: Int!
    statusChangedAt: Int!
    verification: CampaignVerification
    verificationStatus: String!
    verified: Boolean!
    verificationBadges: [String!]!
    riskScore: Int!
    riskLevel: String!
    riskFlags: [String!]!
    riskAssessment: CampaignRiskAssessment
    healthScore: Int!
    healthLevel: String!
    healthAssessment: CampaignHealthAssessment
    sponsors: [CampaignSponsor!]!
    statusHistory: [CampaignStatusHistory!]!
  }

  input TreeFilter {
    planter: String
    region: String
    status: StreamStatus
    search: String
  }

  type Tree {
    id: ID!
    planter: String!
    region: String
    category: String
    status: StreamStatus!
    asset: String!
    sponsoredAmount: String!
    createdAt: Int!
  }

  type Planter {
    address: ID!
    region: String
    treeCount: Int!
    sponsoredAmount: String!
  }

  type Contract {
    address: ID!
    symbol: String!
    streamCount: Int!
    totalVolume: String!
  }

  type Query {
    """
    Search individual sponsored trees derived from indexed payment streams.
    """
    campaigns(filter: CampaignFilter, sort: CampaignSort, pagination: PaginationInput, network: Network): [Campaign!]!

    trees(filter: TreeFilter, pagination: PaginationInput, network: Network): [Tree!]!

    """
    List planters with aggregate sponsorship counts and volume.
    """
    planters(region: String, pagination: PaginationInput, network: Network): [Planter!]!

    """
    List contract/token aggregates used by the payment-stream protocol.
    """
    contracts(pagination: PaginationInput, network: Network): [Contract!]!

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

    """
    A sponsor's impact (estimated CO2 offset) compared with the global
    average sponsor, including a percentile ranking (top 10%, etc.).
    """
    sponsorImpact(address: String!, network: Network): SponsorImpact!
  }
`;
