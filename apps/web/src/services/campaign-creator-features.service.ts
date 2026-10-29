import {
  getCampaign,
  getCampaignDataSource,
  type CampaignDataSource,
  type CampaignRecord,
} from "./campaign.service";

export const MAX_DEADLINE_EXTENSION_DAYS = 30;
export const MAX_DEADLINE_EXTENSION_MS = MAX_DEADLINE_EXTENSION_DAYS * 24 * 60 * 60 * 1000;

export type ExtensionRequestStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface DeadlineExtensionRequest {
  id: string;
  campaignId: string;
  requestedBy: string;
  requestedDays: number;
  reason?: string;
  status: ExtensionRequestStatus;
  requestedAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
  reviewNote?: string;
  previousDeadline: number;
  newDeadline?: number;
}

export interface BackerCampaignNotification {
  id: string;
  campaignId: string;
  recipient: string;
  type: "DEADLINE_EXTENDED";
  message: string;
  createdAt: number;
  read: boolean;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  defaults: Partial<CampaignRecord>;
}

export interface CampaignRewardTier {
  id: string;
  name: string;
  amount: string;
  token?: string;
  description?: string;
  perks?: string[];
}

export interface CampaignComparisonRecord {
  campaignId: string;
  title: string;
  goalAmount: string;
  raisedAmount: string;
  deadline: number | null;
  creator: string;
  creatorReputation: {
    score: number;
    completedCampaigns: number;
    verified: boolean;
  };
  rewardTiers: CampaignRewardTier[];
}

const extensionRequests = new Map<string, DeadlineExtensionRequest>();
const notifications: BackerCampaignNotification[] = [];
const previewTokens = new Map<string, string>();

export const CAMPAIGN_TEMPLATES: readonly CampaignTemplate[] = [
  {
    id: "community-reforestation",
    name: "Community Reforestation",
    category: "environmental",
    description: "A proven starting point for tree planting and community stewardship campaigns.",
    defaults: { category: "environmental", treeSpecies: "Native trees", durationMs: 30 * 24 * 60 * 60 * 1000 },
  },
  {
    id: "clean-water",
    name: "Clean Water Access",
    category: "community",
    description: "Start with a clear funding goal, beneficiary story, and measurable water-access impact.",
    defaults: { category: "community", durationMs: 45 * 24 * 60 * 60 * 1000 },
  },
  {
    id: "open-source-impact",
    name: "Open Source Impact",
    category: "tech",
    description: "A milestone-led template for public goods, developer tooling, and open infrastructure.",
    defaults: { category: "tech", durationMs: 30 * 24 * 60 * 60 * 1000 },
  },
];

function campaignDeadline(campaign: CampaignRecord): number {
  return campaign.deadline ?? campaign.createdAt + (campaign.durationMs ?? 0);
}

function requestKey(campaignId: string): string {
  return campaignId.trim();
}

export async function requestDeadlineExtension(input: {
  campaignId: string;
  requestedBy: string;
  requestedDays: number;
  reason?: string;
  dataSource?: CampaignDataSource;
  now?: number;
}): Promise<DeadlineExtensionRequest> {
  const campaign = await getCampaign(input.campaignId, input.dataSource ?? getCampaignDataSource());
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.status !== "ACTIVE") throw new Error("Only active campaigns can request a deadline extension");
  if (!Number.isInteger(input.requestedDays) || input.requestedDays < 1 || input.requestedDays > MAX_DEADLINE_EXTENSION_DAYS) {
    throw new Error(`requestedDays must be a whole number from 1 to ${MAX_DEADLINE_EXTENSION_DAYS}`);
  }
  if (extensionRequests.has(requestKey(campaign.id))) throw new Error("This campaign has already used its one extension request");
  const now = input.now ?? Date.now();
  const previousDeadline = campaignDeadline(campaign);
  const request: DeadlineExtensionRequest = {
    id: `${campaign.id}:extension:${now}`,
    campaignId: campaign.id,
    requestedBy: input.requestedBy,
    requestedDays: input.requestedDays,
    reason: input.reason?.trim() || undefined,
    status: "PENDING",
    requestedAt: now,
    previousDeadline,
  };
  extensionRequests.set(requestKey(campaign.id), request);
  return request;
}

export async function reviewDeadlineExtension(input: {
  campaignId: string;
  approved: boolean;
  reviewedBy: string;
  reviewNote?: string;
  dataSource?: CampaignDataSource;
  now?: number;
}): Promise<{ request: DeadlineExtensionRequest; campaign: CampaignRecord; notifications: BackerCampaignNotification[] }> {
  const key = requestKey(input.campaignId);
  const request = extensionRequests.get(key);
  if (!request) throw new Error("Deadline extension request not found");
  if (request.status !== "PENDING") throw new Error("Deadline extension request has already been reviewed");
  const dataSource = input.dataSource ?? getCampaignDataSource();
  const campaign = await getCampaign(input.campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  const now = input.now ?? Date.now();
  const updatedRequest: DeadlineExtensionRequest = {
    ...request,
    status: input.approved ? "APPROVED" : "REJECTED",
    reviewedAt: now,
    reviewedBy: input.reviewedBy,
    reviewNote: input.reviewNote?.trim() || undefined,
    newDeadline: input.approved ? request.previousDeadline + request.requestedDays * 24 * 60 * 60 * 1000 : undefined,
  };
  extensionRequests.set(key, updatedRequest);
  if (!input.approved) return { request: updatedRequest, campaign, notifications: [] };
  const updated = await dataSource.saveCampaign({
    ...campaign,
    deadline: updatedRequest.newDeadline,
    durationMs: updatedRequest.newDeadline! - campaign.createdAt,
    updatedAt: now,
  });
  const created = campaign.sponsors.map((sponsor) => ({
    id: `${updatedRequest.id}:${sponsor.address}`,
    campaignId: campaign.id,
    recipient: sponsor.address,
    type: "DEADLINE_EXTENDED" as const,
    message: `${campaign.name} has been extended by ${request.requestedDays} day${request.requestedDays === 1 ? "" : "s"}.`,
    createdAt: now,
    read: false,
  }));
  notifications.push(...created);
  return { request: updatedRequest, campaign: updated, notifications: created };
}

export function getDeadlineExtension(campaignId: string): DeadlineExtensionRequest | null {
  return extensionRequests.get(requestKey(campaignId)) ?? null;
}

export function listCampaignNotifications(campaignId: string, recipient?: string): BackerCampaignNotification[] {
  return notifications.filter((item) => item.campaignId === campaignId && (!recipient || item.recipient === recipient));
}

export async function createPrivatePreview(campaignId: string, dataSource = getCampaignDataSource()): Promise<string> {
  const campaign = await getCampaign(campaignId, dataSource);
  if (!campaign) throw new Error("Campaign not found");
  if (campaign.previewToken) {
    previewTokens.set(campaign.previewToken, campaignId);
    return campaign.previewToken;
  }
  const existing = [...previewTokens.entries()].find(([, id]) => id === campaignId)?.[0];
  if (existing) return existing;
  const token = crypto.randomUUID().replaceAll("-", "");
  previewTokens.set(token, campaignId);
  await dataSource.saveCampaign({ ...campaign, previewToken: token, updatedAt: Date.now() });
  return token;
}

export async function getCampaignByPreviewToken(token: string, dataSource = getCampaignDataSource()): Promise<CampaignRecord | null> {
  const campaignId = previewTokens.get(token) ?? (await dataSource.getCampaigns()).find((campaign) => campaign.previewToken === token)?.id;
  return campaignId ? getCampaign(campaignId, dataSource) : null;
}

export async function cloneCampaign(campaignId: string, creator: string, templateId?: string, dataSource = getCampaignDataSource()): Promise<CampaignRecord> {
  const source = await getCampaign(campaignId, dataSource);
  if (!source) throw new Error("Campaign not found");
  const template = templateId ? CAMPAIGN_TEMPLATES.find((item) => item.id === templateId) : undefined;
  const now = Date.now();
  const cloned: CampaignRecord = {
    ...source,
    ...(template?.defaults ?? {}),
    id: crypto.randomUUID(),
    creator,
    name: `${source.name} (Copy)`,
    raisedAmount: "0",
    sponsorCount: 0,
    sponsors: [],
    treeCount: 0,
    status: "DRAFT",
    createdAt: now,
    updatedAt: now,
    statusChangedAt: now,
    deadline: undefined,
    durationMs: template?.defaults.durationMs ?? source.durationMs,
    previewToken: undefined,
    statusHistory: [{ id: "clone:0", campaignId: "", fromStatus: null, toStatus: "DRAFT", changedBy: creator, changedAt: now, reason: `Cloned from ${source.id}` }],
  };
  cloned.statusHistory[0].campaignId = cloned.id;
  return dataSource.saveCampaign(cloned);
}

export function getTemplate(templateId: string): CampaignTemplate | null {
  return CAMPAIGN_TEMPLATES.find((template) => template.id === templateId) ?? null;
}

export function compareCampaignRecords(campaigns: CampaignRecord[]): CampaignComparisonRecord[] {
  const creatorCounts = new Map<string, number>();
  for (const campaign of campaigns) creatorCounts.set(campaign.creator, (creatorCounts.get(campaign.creator) ?? 0) + 1);
  return campaigns.map((campaign) => ({
    campaignId: campaign.id,
    title: campaign.name,
    goalAmount: campaign.goalAmount,
    raisedAmount: campaign.raisedAmount,
    deadline: campaign.deadline ?? (campaign.durationMs !== undefined ? campaign.createdAt + campaign.durationMs : null),
    creator: campaign.creator,
    creatorReputation: { score: Math.min(100, (creatorCounts.get(campaign.creator) ?? 1) * 20), completedCampaigns: creatorCounts.get(campaign.creator) ?? 1, verified: Boolean(campaign.verified || campaign.creatorVerification?.isVerified) },
    rewardTiers: (campaign.rewardTiers ?? []) as CampaignRewardTier[],
  }));
}

export function resetCampaignCreatorFeatures(): void {
  extensionRequests.clear();
  notifications.length = 0;
  previewTokens.clear();
}
