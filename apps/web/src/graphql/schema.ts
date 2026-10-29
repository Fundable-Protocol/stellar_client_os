/**
 * GraphQL Schema — Aggregate Funding Analytics Gateway (issue #538)
 *
 * Exposes aggregate payment stream metrics queryable by region, category,
 * and asset (token). All monetary amounts are returned as strings to avoid
 * JavaScript BigInt serialisation issues.
 */

export const typeDefs = /* GraphQL */`
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
    """Token contract address (C‚ Stellar address)."""
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
    uniquEbassets: Int!
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
    """Return only this region (ISO 3166-1 alpha-2)  Omit for all regions."""
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

  """Sort options for the Planter job board."""
  enum JobSort {
    """Sort by highest pay rate first."""
    PAY_HIGHEST
    """Sort by soonest deadline first."""
    DEADLINE_SOONEST
    """Sort by easiest (lowest altitude) first."""
    ALTITUDE_LOWEST
  }

  """A job posting on the Planter job board."""
  type Job {
    """Unique job identifier."""
    id: ID!
    """Job title."""
    title: String!
    """Pay rate (as string to avoid floating point issues)."""
    payRate: String!
    """Unix timestamp (seconds) of application deadline."""
    deadline: Int!
    """Altitude of the job site in metres above sea level (lower is easier)."""
    altitude: Float!
  }

  enum CampaignStatus {
    DRAFT
    PENDING_VERIFICATION
    ACTIVE
    PAUSED
    COMPLETED
    FAILED
  }

  enum CampaignCategory {
    TECH
    ART
    SOCIAL_IMPACT
    CLIMATE
    EDUCATION
    HEALTH
    COMMUNITY
    OTHER
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
    categories: [CampaignCategory!]
    tags: [String!]
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

  type CampaignMilestone {
    id: ID!
    campaignId: ID!
    label: String!
    amount: String!
    percent: Float!
    reached: Boolean!
    reachedAt: Int
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
    category: CampaignCategory
    tags: [String!]!
    milestones: [CampaignMilestone!]!
    sponsors: [CampaignSponsor!]!
    statusHistory: [CampaignStatusHistory!]!
    """Creator-defined impact metric for socially-focused campaigns."""
    impactMetric: ImpactMetric
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

  enum SequelRelation {
    SEQUEL
    PREQUEL
    SPINOFF
    RELATED
  }

  type CampaignSeries {
    id: ID!
    name: String!
    description: String
    creator: String!
    campaignIds: [ID!]!
    createdAt: Int!
    updatedAt: Int!
  }

  type CampaignSequelLink {
    id: ID!
    sourceCampaignId: ID!
    targetCampaignId: ID!
    relation: SequelRelation!
    order: Int
    seriesId: ID
    notes: String
    linkedBy: String!
    linkedAt: Int!
  }

  """A campaign plus how it relates to the queried campaign."""
  type CampaignSequelSummary {
    link: CampaignSequelLink!
    campaign: Campaign!
  }

  """The campaign that continues a series, with its series context."""
  type NextInSeriesResult {
    link: CampaignSequelLink!
    series: CampaignSeries
    campaign: Campaign!
  }

  """Per-campaign creator analytics dashboard (issue: analytics dashboard)."""
  type TrafficSourceStat {
    source: String!
    label: String!
    visitors: Int!
    views: Int!
    share: Float!
    pledges: Int
    conversionRate: Float
  }

  type PledgeFunnelStage {
    stage: String!
    label: String!
    count: Int!
    conversionRate: Float!
    dropoffRate: Float!
  }

  type FunnelStage {
    stage: String!
    label: String!
    count: Int!
    conversionRate: Float!
    dropoffRate: Float!
  }

  type BackerDemographic {
    region: String!
    backers: Int!
    totalAmount: String!
    share: Float!
  }

  type RewardTierStat {
    tierId: String!
    name: String!
    price: String!
    backers: Int!
    revenue: String!
    share: Float!
  }

  type DailyFundingPoint {
    date: String!
    amount: String!
    contributions: Int!
    cumulative: String!
  }

  type HourlyFundingPoint {
    hour: String!
    amount: String!
    contributions: Int!
    cumulative: String!
  }

  type BenchmarkMetric {
    label: String!
    current: Float!
    benchmark: Float!
    unit: String!
    delta: Float!
  }

  type CampaignBenchmark {
    category: String!
    anonymizedSampleSize: Int!
    comparedTo: String!
    metrics: [BenchmarkMetric!]!
    suggestions: [String!]!
  }

  type CampaignAnalyticsDashboard {
    campaignId: ID!
    updatedAt: Int!
    trafficSources: [TrafficSourceStat!]!
    funnel: [FunnelStage!]!
    pledgeFunnel: [PledgeFunnelStage!]
    demographics: [BackerDemographic!]!
    rewardTiers: [RewardTierStat!]!
    dailyTrend: [DailyFundingPoint!]!
    hourlyTrend: [HourlyFundingPoint!]
    totals: CampaignAnalyticsTotals!
    benchmark: CampaignBenchmark!
  }

  type CampaignAnalyticsTotals {
    visitors: Int!
    contributions: Int!
    totalFunded: String!
    conversionRate: Float!
  }

  """Supported export formats for the campaign analytics dashboard."""
  enum AnalyticsExportFormat {
    CSV
    PDF
  }

  """An exported analytics report, base64-encoded for transport."""
  type CampaignAnalyticsExport {
    campaignId: ID!
    format: AnalyticsExportFormat!
    filename: String!
    mimeType: String!
    """Base64-encoded report contents."""
    payload: String!
    generatedAt: Int!
  }

  enum GrantProgramStatus {
    OPEN
    PAUSED
    CLOSED
  }

  type GrantProgram {
    id: ID!
    name: String!
    description: String
    matchPercentage: Int!
    perCampaignCap: String!
    totalPool: String!
    allocated: String!
    eligibilityCriteria: [String!]!
    status: GrantProgramStatus!
    createdAt: Int!
    updatedAt: Int!
  }

  type GrantAllocation {
    id: ID!
    programId: ID!
    campaignId: ID!
    baseContribution: String!
    matchedAmount: String!
    allocatedBy: String!
    allocatedAt: Int!
  }

  type GrantProgramSummary {
    program: GrantProgram!
    remainingPool: String!
    eligible: Boolean!
    matchedForCampaign: String!
    nextMatchAmount: String!
  }

  """Lifecycle status of a campaign dispute."""
  enum DisputeStatus {
    OPEN
    AWAITING_CREATOR_RESPONSE
    UNDER_REVIEW
    RESOLVED
    REJECTED
  }

  """Reason a backer is filing a dispute."""
  enum DisputeReason {
    UNDELIVERED_REWARD
    FRAUDULENT_CAMPAIGN
    MISREPRESENTED_IMPACT
    OTHER
  }

  """Type of refund issued by a platform mediator."""
  enum RefundType {
    NONE
    PARTIAL
    FULL
  }

  """A formal dispute raised by a backer against a campaign."""
  type CampaignDispute {
    id: ID!
    campaignId: ID!
    backer: String!
    reason: DisputeReason!
    description: String!
    status: DisputeStatus!
    """Unix timestamp (seconds) when the dispute was filed."""
    filedAt: Int!
    """Unix timestamp (seconds) by which the creator must respond."""
    creatorResponseDeadline: Int!
    """Creator's response, if any."""
    creatorResponse: String
    """Unix timestamp (seconds) of the creator's response."""
    creatorRespondedAt: Int
    """Platform mediator assigned to the dispute."""
    mediator: String
    """Refund type issued by the mediator."""
    refundType: RefundType!
    """Refund amount (as string), if any."""
    refundAmount: String
    """Unix timestamp (seconds) when the dispute was resolved."""
    resolvedAt: Int
    """Mediator's resolution notes."""
    resolutionNotes: String
  }

  """Input for a backer filing a dispute."""
  input FileDisputeInput {
    campaignId: ID!
    backer: String!
    reason: DisputeReason!
    description: String!
  }

  """Input for a creator responding to a dispute."""
  input RespondToDisputeInput {
    disputeId: ID!
    creator: String!
    response: String!
  }

  """Input for a platform mediator resolving a dispute."""
  input ResolveDisputeInput {
    disputeId: ID!
    mediator: String!
    refundType: RefundType!
    refundAmount: String
    resolutionNotes: String
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
    Fetch job board postings with sort options.
    """
    jobBoard(
      """Sort order for the job list."""
      sort: JobSort = PAY_HIGHEST
      """Pagination options."""
      pagination: PaginationInput
    ): [Job!]!

    """
    A sponsor's impact (estimated CO2 offset) compared with the global
    average sponsor, including a percentile ranking (top 10%, etc.).
    """
    sponsorImpact(address: String!, network: Network): SponsorImpact!

    """
    Campaigns linked to the given campaign as sequels, prequels, spin-offs,
    or related projects, including the franchise (series) it belongs to.
    """
    campaignSequels(campaignId: ID!, relation: SequelRelation): [CampaignSequelSummary!]!

    """
    The next campaign in a series (franchise) for the given campaign, when one
    exists.
    """
    nextInSeries(campaignId: ID!): NextInSeriesResult

    """
    Detailed creator analytics for a campaign: traffic sources, conversion
    funnel, backer demographics, reward tier popularity, and daily funding
    trends.
    """
    campaignAnalytics(campaignId: ID!, network: Network): CampaignAnalyticsDashboard

    """
    Export the creator analytics dashboard (traffic sources, conversion
    funnel, backer demographics, and daily funding trend) as a CSV or PDF
    report, returned base64-encoded.
    """
    campaignAnalyticsExport(
      campaignId: ID!
      format: AnalyticsExportFormat = CSV
      network: Network
    ): CampaignAnalyticsExport

    """
    The platform-funded grant matching programs available to underrepresented
    creators.
    """
    grantPrograms: [GrantProgram!]!

    """
    Matching summary for a campaign within a grant program: eligibility,
    amount already matched, and the next match available.
    """
    grantProgramSummary(programId: ID!, campaignId: ID!): GrantProgramSummary

    """
    The grant allocations awarded to a campaign across all programs.
    """
    campaignGrantAllocations(campaignId: ID!): [GrantAllocation!]!

    """
    Disputes filed against a campaign by backers.
    """
    campaignDisputes(campaignId: ID!): [CampaignDispute!]!

    """
    A single dispute by its identifier.
    """
    dispute(id: ID!): CampaignDispute
  }

  """
  A clone of an existing indexed stream/campaign returned by cloneCampaign.
  """
  type CloneResult {
    id: ID!
    sender: String!
    recipient: String!
    token: String!
    status: StreamStatus!
    totalAmount: String!
    withdrawnAmount: String!
    startTime: Int!
    endTime: Int!
  }

  type Mutation {
    """
    Clones an indexed stream so a creator can start from an existing campaign.
    """
    cloneCampaign(id: ID!, network: Network): CloneResult

    """
    Files a dispute against a campaign (post-campaign close).
    """
    fileDispute(input: FileDisputeInput!): CampaignDispute!

    """
    Creator responds to a dispute within the response window.
    """
    respondToDispute(input: RespondToDisputeInput!): CampaignDispute!

    """
    Platform mediator resolves a dispute with a partial or full refund.
    """
    resolveDispute(input: ResolveDisputeInput!): CampaignDispute!
  }
`;