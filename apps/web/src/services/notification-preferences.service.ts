import {
  isDigestDue,
  parseNotificationPreferences,
  type NotificationChannel,
  type NotificationFrequency,
} from "@/lib/notification-schedule";

/**
 * Notification preferences service (#950).
 *
 * Stores per-sponsor, per-campaign notification preferences (frequency +
 * channel), tracks last-notified timestamps, and exposes the due-queue used
 * by the dispatch endpoint. In-memory data source, same pattern as the other
 * campaign services; swap via `setNotificationPreferencesDataSource` when a
 * durable backend lands.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  campaignId: string;
  /** Sponsor address or account id. */
  sponsorId: string;
  frequency: NotificationFrequency;
  channel: NotificationChannel;
  email?: string;
  pushEndpoint?: string;
  /** Epoch ms of the last progress digest delivered (0 = never). */
  lastNotifiedAt: number;
  /** Epoch ms of creation. */
  createdAt: number;
  /** Epoch ms of the last update. */
  updatedAt: number;
}

export interface PreferencesDataSource {
  getAll(): Promise<NotificationPreferences[]>;
  save(prefs: NotificationPreferences): Promise<NotificationPreferences>;
}

export class InMemoryPreferencesDataSource implements PreferencesDataSource {
  private records = new Map<string, NotificationPreferences>();

  private key(campaignId: string, sponsorId: string): string {
    return `${campaignId}:${sponsorId}`;
  }

  async getAll(): Promise<NotificationPreferences[]> {
    return Array.from(this.records.values());
  }

  async save(prefs: NotificationPreferences): Promise<NotificationPreferences> {
    this.records.set(this.key(prefs.campaignId, prefs.sponsorId), prefs);
    return prefs;
  }
}

let defaultDataSource: PreferencesDataSource | undefined;

export function getPreferencesDataSource(): PreferencesDataSource {
  return (defaultDataSource ??= new InMemoryPreferencesDataSource());
}

export function setNotificationPreferencesDataSource(dataSource: PreferencesDataSource): void {
  defaultDataSource = dataSource;
}

// ── Operations ────────────────────────────────────────────────────────────────

export class PreferencesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PreferencesValidationError";
  }
}

/**
 * Create or update a sponsor's notification preferences for a campaign.
 * Validates channel-specific requirements; preserves lastNotifiedAt on update.
 */
export async function setPreferences(
  input: {
    campaignId: string;
    sponsorId: string;
    frequency: NotificationFrequency;
    channel: NotificationChannel;
    email?: string;
    pushEndpoint?: string;
  },
  dataSource = getPreferencesDataSource(),
  now = Date.now(),
): Promise<NotificationPreferences> {
  const parsed = parseNotificationPreferences(input);
  if (!parsed.ok) throw new PreferencesValidationError(parsed.error);

  const existing = (await dataSource.getAll()).find(
    (p) => p.campaignId === input.campaignId && p.sponsorId === input.sponsorId,
  );

  const record: NotificationPreferences = {
    ...(existing ?? {}),
    campaignId: input.campaignId,
    sponsorId: input.sponsorId,
    frequency: input.frequency,
    channel: input.channel,
    email: input.email,
    pushEndpoint: input.pushEndpoint,
    lastNotifiedAt: existing?.lastNotifiedAt ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  return dataSource.save(record);
}

export async function getPreferences(
  campaignId: string,
  sponsorId: string,
  dataSource = getPreferencesDataSource(),
): Promise<NotificationPreferences | null> {
  const all = await dataSource.getAll();
  return all.find((p) => p.campaignId === campaignId && p.sponsorId === sponsorId) ?? null;
}

export async function getPreferencesForCampaign(
  campaignId: string,
  dataSource = getPreferencesDataSource(),
): Promise<NotificationPreferences[]> {
  const all = await dataSource.getAll();
  return all.filter((p) => p.campaignId === campaignId);
}

/**
 * The dispatch due-queue: every preference whose frequency interval has
 * elapsed (milestones-mode sponsors are excluded — they are event-driven).
 */
export async function getDueDigests(
  now: number = Date.now(),
  dataSource = getPreferencesDataSource(),
): Promise<NotificationPreferences[]> {
  const all = await dataSource.getAll();
  return all.filter((p) => isDigestDue(p, p.lastNotifiedAt, now));
}

/** Record that a digest was delivered (advances the schedule). */
export async function markNotified(
  campaignId: string,
  sponsorId: string,
  at: number = Date.now(),
  dataSource = getPreferencesDataSource(),
): Promise<NotificationPreferences | null> {
  const prefs = await getPreferences(campaignId, sponsorId, dataSource);
  if (!prefs) return null;
  return dataSource.save({ ...prefs, lastNotifiedAt: at, updatedAt: at });
}
