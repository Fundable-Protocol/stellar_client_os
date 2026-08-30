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

export interface CampaignRecord {
  id: string;
  creator: string;
  name: string;
  description?: string;
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

export async function getCampaign(campaignId: string, dataSource = getCampaignDataSource()): Promise<CampaignRecord | null> {
  return (await dataSource.getCampaigns()).find((campaign) => campaign.id === campaignId) ?? null;
}

export async function createCampaign(input: {
  id?: string;
  creator: string;
  name: string;
  description?: string;
  goalAmount: string;
  network?: "testnet" | "mainnet";
}, dataSource = getCampaignDataSource(), now = Date.now()): Promise<CampaignRecord> {
  const campaign: CampaignRecord = {
    id: input.id ?? crypto.randomUUID(),
    creator: input.creator,
    name: input.name,
    description: input.description,
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
