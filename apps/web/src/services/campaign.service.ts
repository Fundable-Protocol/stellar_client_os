export type CampaignStatus = "DRAFT" | "PENDING_VERIFICATION" | "ACTIVE" | "PAUSED" | "COMPLETED" | "FAILED";

export type CampaignSortField =
  | "createdAt"
  | "updatedAt"
  | "name"
  | "status"
  | "goalAmount"
  | "raisedAmount"
  | "sponsorCount"
  | "treeCount";

export type SortDirection = "ASC" | "DESC";

export interface SponsorRecord {
  id: string;
  campaignId: string;
  address: string;
  amount: string;
  token: string;
  sponsoredAt: number;
}

export interface StatusHistoryEntry {
  id: string;
  campaignId: string;
  fromStatus: CampaignStatus | null;
  toStatus: CampaignStatus;
  changedBy: string;
  changedAt: number;
  reason?: string;
}

export type CampaignVerificationStatus = "verified" | "partial" | "unverified";
export type CampaignRiskLevel = "low" | "moderate" | "high" | "critical";
export type CampaignHealthLevel = "excellent" | "good" | "fair" | "poor";

export interface CampaignVerificationSummary {
  emailVerified: boolean;
  phoneVerified: boolean;
  addressVerified: boolean;
  badges: string[];
  status: CampaignVerificationStatus;
  isVerified: boolean;
  verifiedCount: number;
  totalCount: number;
}

export interface CampaignRiskAssessment {
  score: number;
  level: CampaignRiskLevel;
  redFlags: string[];
  reasons: string[];
  flagged: boolean;
}

export interface CampaignHealthBreakdown {
  descriptionQuality: number;
  creatorHistory: number;
  responseTime: number;
  backerFeedback: number;
}

export interface CampaignHealthAssessment {
  score: number;
  level: CampaignHealthLevel;
  breakdown: CampaignHealthBreakdown;
}

export interface CampaignRecord {
  id: string;
  creator: string;
  name: string;
  description?: string;
  /** Geographic location of the campaign, used for duplicate detection. */
  location?: string;
  /** Intended campaign duration in milliseconds, used for duplicate detection. */
  durationMs?: number;
  status: CampaignStatus;
  goalAmount: string;
  raisedAmount: string;
  sponsorCount: number;
  treeCount: number;
  createdAt: number;
  updatedAt: number;
  statusChangedAt: number;
  network?: "testnet" | "mainnet";
  sponsors: SponsorRecord[];
  statusHistory: StatusHistoryEntry[];
  creatorVerification?: CampaignVerificationSummary;
  verification?: CampaignVerificationSummary;
  verificationStatus?: CampaignVerificationStatus;
  verified?: boolean;
  verificationBadges?: string[];
  riskAssessment?: CampaignRiskAssessment;
  riskScore?: number;
  riskLevel?: CampaignRiskLevel;
  riskFlags?: string[];
  healthAssessment?: CampaignHealthAssessment;
  healthScore?: number;
  healthLevel?: CampaignHealthLevel;
}

export interface CampaignCreatorBadge {
  name: "Campaign Starter" | "Campaign Builder" | "Campaign Champion";
  threshold: number;
  description: string;
}

export const CAMPAIGN_CREATOR_BADGES: readonly CampaignCreatorBadge[] = [
  { name: "Campaign Starter", threshold: 10, description: "Created 10 campaigns" },
  { name: "Campaign Builder", threshold: 50, description: "Created 50 campaigns" },
  { name: "Campaign Champion", threshold: 100, description: "Created 100 campaigns" },
];

export function getCampaignCreatorBadges(campaignCount: number): CampaignCreatorBadge[] {
  const safeCount = Number.isFinite(campaignCount) ? Math.max(0, Math.floor(campaignCount)) : 0;
  return CAMPAIGN_CREATOR_BADGES.filter((badge) => safeCount >= badge.threshold);
}

export function getCampaignCreatorBadge(campaignCount: number): CampaignCreatorBadge | null {
  return getCampaignCreatorBadges(campaignCount).at(-1) ?? null;
}

export interface CampaignDataSource {
  getCampaigns(network?: string): Promise<CampaignRecord[]>;
  saveCampaign(campaign: CampaignRecord): Promise<CampaignRecord>;
}

export interface CampaignFilter {
  status?: CampaignStatus;
  creator?: string;
  search?: string;
  minGoalAmount?: string;
  maxGoalAmount?: string;
  createdAfter?: number;
  createdBefore?: number;
}

export interface CampaignQueryInput {
  filter?: CampaignFilter;
  sort?: { field?: CampaignSortField; direction?: SortDirection };
  limit?: number;
  offset?: number;
  network?: "testnet" | "mainnet";
}

export class InMemoryCampaignDataSource implements CampaignDataSource {
  private campaigns = new Map<string, CampaignRecord>();

  async getCampaigns(network?: string): Promise<CampaignRecord[]> {
    return Array.from(this.campaigns.values()).filter((campaign) => !network || campaign.network === network);
  }

  async saveCampaign(campaign: CampaignRecord): Promise<CampaignRecord> {
    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }
}

let defaultDataSource: CampaignDataSource | undefined;

export function getCampaignDataSource(): CampaignDataSource {
  return (defaultDataSource ??= new InMemoryCampaignDataSource());
}

export function setCampaignDataSource(dataSource: CampaignDataSource): void {
  defaultDataSource = dataSource;
}

function compareValues(a: CampaignRecord, b: CampaignRecord, field: CampaignSortField): number {
  if (field === "name" || field === "status") return String(a[field]).localeCompare(String(b[field]));
  if (field === "goalAmount" || field === "raisedAmount") return BigInt(a[field]) < BigInt(b[field]) ? -1 : BigInt(a[field]) > BigInt(b[field]) ? 1 : 0;
  return Number(a[field]) - Number(b[field]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getCampaignVerificationSummary(campaign: Partial<CampaignRecord> = {}): CampaignVerificationSummary {
  const explicit = campaign.creatorVerification ?? campaign.verification ?? {};
  const emailVerified = Boolean((explicit as Partial<CampaignVerificationSummary>).emailVerified ?? false);
  const phoneVerified = Boolean((explicit as Partial<CampaignVerificationSummary>).phoneVerified ?? false);
  const addressVerified = Boolean((explicit as Partial<CampaignVerificationSummary>).addressVerified ?? false);
  const badges = [
    emailVerified ? "email" : null,
    phoneVerified ? "phone" : null,
    addressVerified ? "address" : null,
  ].filter((badge): badge is string => Boolean(badge));
  const verifiedCount = [emailVerified, phoneVerified, addressVerified].filter(Boolean).length;
  const status: CampaignVerificationStatus = verifiedCount === 3 ? "verified" : verifiedCount > 0 ? "partial" : "unverified";

  return {
    emailVerified,
    phoneVerified,
    addressVerified,
    verifiedEmail: emailVerified,
    verifiedPhone: phoneVerified,
    verifiedAddress: addressVerified,
    badges,
    status,
    isVerified: verifiedCount === 3,
    verifiedCount,
    totalCount: 3,
  };
}

export function getCampaignRiskAssessment(campaign: Partial<CampaignRecord> = {}): CampaignRiskAssessment {
  const reasons: string[] = [];
  let score = 0;

  if (!campaign.description || campaign.description.trim().length < 40) {
    reasons.push("Vague campaign goals");
    score += 25;
  }

  if (campaign.creator && campaign.createdAt && Date.now() - campaign.createdAt < 7 * 24 * 60 * 60 * 1000) {
    reasons.push("New creator");
    score += 20;
  }

  if (campaign.goalAmount && campaign.raisedAmount) {
    const goal = BigInt(campaign.goalAmount);
    const raised = BigInt(campaign.raisedAmount ?? "0");
    if (goal > 0n && raised === 0n) {
      reasons.push("Campaign timeline may be unrealistic");
      score += 25;
    }
  }

  const explicit = campaign.riskAssessment ?? {} as Partial<CampaignRiskAssessment>;
  if (explicit.score !== undefined) {
    score = explicit.score;
  }
  if (explicit.redFlags?.length) {
    reasons.push(...explicit.redFlags);
  }

  const uniqueReasons = Array.from(new Set(reasons.filter(Boolean)));
  const finalScore = clamp(score, 0, 100);
  let level: CampaignRiskLevel = "low";
  if (finalScore >= 80) level = "critical";
  else if (finalScore >= 60) level = "high";
  else if (finalScore >= 30) level = "moderate";

  return {
    score: finalScore,
    level,
    redFlags: uniqueReasons,
    reasons: uniqueReasons,
    flagged: uniqueReasons.length > 0,
  };
}

export function getCampaignHealthAssessment(campaign: Partial<CampaignRecord> = {}): CampaignHealthAssessment {
  const descriptionLength = campaign.description?.trim().length ?? 0;
  const descriptionQuality = clamp(Math.round((descriptionLength / 220) * 30), 0, 30);
  const creatorHistory = clamp(Math.round(Math.min(25, (campaign.statusHistory?.length ?? 0) * 5 + (campaign.sponsorCount ?? 0) * 2)), 0, 25);
  const responseWindowMs = campaign.statusChangedAt && campaign.createdAt ? campaign.statusChangedAt - campaign.createdAt : 0;
  const responseTime = clamp(Math.round(20 - Math.min(20, responseWindowMs / (1000 * 60 * 60 * 24 * 5))), 0, 20);
  const backerFeedback = clamp(Math.round(Math.min(25, (campaign.sponsorCount ?? 0) * 8 + (campaign.status === "COMPLETED" ? 5 : 0))), 0, 25);
  const score = clamp(descriptionQuality + creatorHistory + responseTime + backerFeedback, 1, 100);

  let level: CampaignHealthLevel = "poor";
  if (score >= 80) level = "excellent";
  else if (score >= 60) level = "good";
  else if (score >= 40) level = "fair";

  return {
    score,
    level,
    breakdown: {
      descriptionQuality,
      creatorHistory,
      responseTime,
      backerFeedback,
    },
  };
}

export const calculateCampaignVerification = getCampaignVerificationSummary;
export const getCreatorVerificationStatus = getCampaignVerificationSummary;
export const calculateCampaignRisk = getCampaignRiskAssessment;
export const assessCampaignRisk = getCampaignRiskAssessment;
export const calculateCampaignHealthScore = getCampaignHealthAssessment;
export const evaluateCampaignHealth = getCampaignHealthAssessment;

export async function getCampaign(campaignId: string, dataSource = getCampaignDataSource()): Promise<CampaignRecord | null> {
  return (await dataSource.getCampaigns()).find((campaign) => campaign.id === campaignId) ?? null;
}

export async function createCampaign(input: {
  id?: string;
  creator: string;
  name: string;
  description?: string;
  location?: string;
  durationMs?: number;
  deadline?: number;
  goalAmount: string;
  network?: "testnet" | "mainnet";
}, dataSource = getCampaignDataSource(), now = Date.now()): Promise<CampaignRecord> {
  const campaign: CampaignRecord = {
    id: input.id ?? crypto.randomUUID(),
    creator: input.creator,
    name: input.name,
    description: input.description,
    location: input.location,
    durationMs: input.deadline !== undefined ? input.deadline - now : input.durationMs,
    status: "DRAFT",
    goalAmount: input.goalAmount,
    raisedAmount: "0",
    sponsorCount: 0,
    treeCount: 0,
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    network: input.network,
    sponsors: [],
    statusHistory: [{
      id: `${input.id ?? "campaign"}:${now}:0`,
      campaignId: input.id ?? "",
      fromStatus: null,
      toStatus: "DRAFT",
      changedBy: input.creator,
      changedAt: now,
      reason: "Initial campaign status",
    }],
  };
  campaign.statusHistory[0].campaignId = campaign.id;
  campaign.statusHistory[0].id = `${campaign.id}:${now}:0`;
  return dataSource.saveCampaign(campaign);
}

/**
 * Normalise a free-text attribute for duplicate comparison: trimmed and
 * case-insensitive so accidental near-duplicates are caught (issue #729).
 */
export function normalizeCampaignField(value: string): string {
  return value.trim().toLowerCase();
}

export interface CampaignDuplicateLookup {
  creator: string;
  name: string;
  location?: string;
  durationMs?: number;
}

/**
 * Find previously saved campaigns that would be indistinguishable from a new
 * one being created by the same creator (issue #729).
 *
 * A candidate is a duplicate when it shares the creator and a normalised name.
 * `location` only contributes when provided by BOTH the new input and the
 * candidate (an explicit value never matches an absent one). `durationMs`
 * matches only when both sides carry an exact, equal value. Fields absent on
 * both sides are treated as equal, so a bare name match still surfaces
 * accidental double-submissions.
 */
export async function findDuplicateCampaigns(
  input: CampaignDuplicateLookup,
  dataSource = getCampaignDataSource(),
): Promise<CampaignRecord[]> {
  const normalizedName = normalizeCampaignField(input.name);
  const normalizedLocation = input.location !== undefined ? normalizeCampaignField(input.location) : undefined;
  const campaigns = await dataSource.getCampaigns();
  return campaigns.filter((campaign) => {
    if (campaign.creator !== input.creator) return false;
    if (normalizeCampaignField(campaign.name) !== normalizedName) return false;
    if (normalizedLocation !== undefined) {
      if (campaign.location === undefined) return false;
      if (normalizeCampaignField(campaign.location) !== normalizedLocation) return false;
    }
    if (input.durationMs !== undefined) {
      if (campaign.durationMs === undefined) return false;
      if (campaign.durationMs !== input.durationMs) return false;
    }
    return true;
  });
}

export async function queryCampaigns(input: CampaignQueryInput = {}, dataSource = getCampaignDataSource()): Promise<CampaignRecord[]> {
  const filter = input.filter ?? {};
  let campaigns = await dataSource.getCampaigns(input.network);
  campaigns = campaigns.filter((campaign) => {
    if (filter.status && campaign.status !== filter.status) return false;
    if (filter.creator && campaign.creator !== filter.creator) return false;
    if (filter.createdAfter !== undefined && campaign.createdAt < filter.createdAfter) return false;
    if (filter.createdBefore !== undefined && campaign.createdAt > filter.createdBefore) return false;
    if (filter.minGoalAmount && BigInt(campaign.goalAmount) < BigInt(filter.minGoalAmount)) return false;
    if (filter.maxGoalAmount && BigInt(campaign.goalAmount) > BigInt(filter.maxGoalAmount)) return false;
    if (filter.search) {
      const haystack = `${campaign.id} ${campaign.name} ${campaign.description ?? ""} ${campaign.creator}`.toLowerCase();
      if (!haystack.includes(filter.search.toLowerCase())) return false;
    }
    return true;
  });

  const field = input.sort?.field ?? "createdAt";
  const direction = input.sort?.direction === "ASC" ? 1 : -1;
  campaigns.sort((a, b) => compareValues(a, b, field) * direction || a.id.localeCompare(b.id));
  const offset = Math.max(input.offset ?? 0, 0);
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  return campaigns.slice(offset, offset + limit);
}

const allowedTransitions: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["PENDING_VERIFICATION", "FAILED"],
  PENDING_VERIFICATION: ["ACTIVE", "FAILED"],
  ACTIVE: ["PAUSED", "COMPLETED", "FAILED"],
  PAUSED: ["ACTIVE", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

export async function transitionCampaignStatus(
  campaign: CampaignRecord,
  toStatus: CampaignStatus,
  changedBy: string,
  reason: string | undefined,
  dataSource = getCampaignDataSource(),
  now = Date.now(),
): Promise<CampaignRecord> {
  if (campaign.status === toStatus) return campaign;
  if (!allowedTransitions[campaign.status].includes(toStatus)) {
    throw new Error(`Invalid campaign status transition: ${campaign.status} -> ${toStatus}`);
  }
  const next: CampaignRecord = {
    ...campaign,
    updatedAt: now,
    status: toStatus,
    statusChangedAt: now,
    statusHistory: [...campaign.statusHistory, {
      id: `${campaign.id}:${now}:${campaign.statusHistory.length}`,
      campaignId: campaign.id,
      fromStatus: campaign.status,
      toStatus,
      changedBy,
      changedAt: now,
      reason,
    }],
  };
  return dataSource.saveCampaign(next);
}

export function csvEscape(value: unknown): string {
  const stringValue = String(value ?? "");
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
}

export function sponsorsToCsv(campaign: CampaignRecord): string {
  const rows = [["sponsor_id", "campaign_id", "address", "amount", "token", "sponsored_at"], ...campaign.sponsors.map((sponsor) => [sponsor.id, sponsor.campaignId, sponsor.address, sponsor.amount, sponsor.token, new Date(sponsor.sponsoredAt).toISOString()])];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

export function impactReportToCsv(campaign: CampaignRecord): string {
  const rows = [
    ["campaign_id", "campaign_name", "status", "goal_amount", "raised_amount", "sponsor_count", "tree_count", "created_at", "updated_at"],
    [campaign.id, campaign.name, campaign.status, campaign.goalAmount, campaign.raisedAmount, campaign.sponsorCount, campaign.treeCount, new Date(campaign.createdAt).toISOString(), new Date(campaign.updatedAt).toISOString()],
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n") + "\n";
}

export async function exportCampaignCsv(campaignId: string, report: "sponsors" | "impact", dataSource = getCampaignDataSource()): Promise<string | null> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) return null;
  return report === "sponsors" ? sponsorsToCsv(campaign) : impactReportToCsv(campaign);
}
