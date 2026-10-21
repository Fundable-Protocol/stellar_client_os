/**
 * Campaign Waitlist Service
 *
 * Stores the emails of people waiting for a campaign that has not launched
 * yet. Follows the in-memory data source pattern used by the other campaign
 * services so a durable backend can replace it later.
 */

export interface CampaignWaitlistEntry {
  id: string;
  campaignId: string;
  email: string;
  /** Whether the person asked to be notified when the campaign goes live. */
  notifyOnLaunch: boolean;
  createdAt: number;
}

export interface CampaignWaitlistDataSource {
  join(campaignId: string, email: string, notifyOnLaunch?: boolean): Promise<CampaignWaitlistEntry>;
  list(campaignId: string): Promise<CampaignWaitlistEntry[]>;
  count(campaignId: string): Promise<number>;
  remove(campaignId: string, email: string): Promise<boolean>;
}

const normalize = (value: string) => value.trim().toLowerCase();

export class InMemoryCampaignWaitlistDataSource implements CampaignWaitlistDataSource {
  private entries = new Map<string, CampaignWaitlistEntry>();

  private key(campaignId: string, email: string): string {
    return `${normalize(campaignId)}::${normalize(email)}`;
  }

  async join(
    campaignId: string,
    email: string,
    notifyOnLaunch = true,
  ): Promise<CampaignWaitlistEntry> {
    const now = Date.now();
    const entry: CampaignWaitlistEntry = {
      id: `wl_${crypto.randomUUID()}`,
      campaignId: campaignId.trim(),
      email: normalize(email),
      notifyOnLaunch,
      createdAt: now,
    };
    this.entries.set(this.key(campaignId, email), entry);
    return entry;
  }

  async list(campaignId: string): Promise<CampaignWaitlistEntry[]> {
    const campaign = normalize(campaignId);
    return Array.from(this.entries.values())
      .filter((entry) => normalize(entry.campaignId) === campaign)
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  async count(campaignId: string): Promise<number> {
    return (await this.list(campaignId)).length;
  }

  async remove(campaignId: string, email: string): Promise<boolean> {
    return this.entries.delete(this.key(campaignId, email));
  }
}

let defaultDataSource: CampaignWaitlistDataSource | undefined;

export function getCampaignWaitlistDataSource(): CampaignWaitlistDataSource {
  return (defaultDataSource ??= new InMemoryCampaignWaitlistDataSource());
}

export function setCampaignWaitlistDataSource(dataSource: CampaignWaitlistDataSource): void {
  defaultDataSource = dataSource;
}

/** Reset the waitlist store. Used by tests to isolate state. */
export function resetCampaignWaitlistDataSource(): void {
  defaultDataSource = new InMemoryCampaignWaitlistDataSource();
}

export class CampaignWaitlistValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignWaitlistValidationError";
  }
}

const EMAIL_PATTERN = /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/;

/** Join the waitlist of a campaign. Joining twice is idempotent. */
export async function joinCampaignWaitlist(
  campaignId: string,
  email: string,
  notifyOnLaunch = true,
  dataSource = getCampaignWaitlistDataSource(),
): Promise<CampaignWaitlistEntry> {
  if (!campaignId?.trim()) {
    throw new CampaignWaitlistValidationError("campaignId is required");
  }
  if (!email?.trim() || !EMAIL_PATTERN.test(email.trim())) {
    throw new CampaignWaitlistValidationError("A valid email address is required");
  }
  return dataSource.join(campaignId, email.trim(), notifyOnLaunch);
}

/** Number of people waiting for a campaign. */
export async function countCampaignWaitlist(
  campaignId: string,
  dataSource = getCampaignWaitlistDataSource(),
): Promise<number> {
  return dataSource.count(campaignId);
}
