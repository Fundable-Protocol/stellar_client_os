import {
  type BackerCampaignNotificationPreference,
  type CampaignNotificationEvent,
  type ChannelPreferences,
  type EventChannelPreferences,
  type NotificationChannel,
  type BulkUpdatePreferencesInput,
  type BackedCampaignSummary,
  DEFAULT_EVENT_PREFERENCES,
  CAMPAIGN_NOTIFICATION_EVENTS,
  NOTIFICATION_CHANNELS,
} from "@/types/backer-notification-preferences";

export interface BackerNotificationPreferencesDataSource {
  getAll(): Promise<BackerCampaignNotificationPreference[]>;
  getByBacker(backerAddress: string): Promise<BackerCampaignNotificationPreference[]>;
  get(backerAddress: string, campaignId: string): Promise<BackerCampaignNotificationPreference | null>;
  save(pref: BackerCampaignNotificationPreference): Promise<BackerCampaignNotificationPreference>;
  saveMany(prefs: BackerCampaignNotificationPreference[]): Promise<BackerCampaignNotificationPreference[]>;
}

export class InMemoryBackerNotificationPreferencesDataSource
  implements BackerNotificationPreferencesDataSource
{
  private store = new Map<string, BackerCampaignNotificationPreference>();

  private key(backerAddress: string, campaignId: string): string {
    return `${backerAddress.toLowerCase()}:${campaignId}`;
  }

  async getAll(): Promise<BackerCampaignNotificationPreference[]> {
    return Array.from(this.store.values());
  }

  async getByBacker(backerAddress: string): Promise<BackerCampaignNotificationPreference[]> {
    const prefix = `${backerAddress.toLowerCase()}:`;
    return Array.from(this.store.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, val]) => ({ ...val }));
  }

  async get(
    backerAddress: string,
    campaignId: string
  ): Promise<BackerCampaignNotificationPreference | null> {
    const found = this.store.get(this.key(backerAddress, campaignId));
    return found ? { ...found } : null;
  }

  async save(
    pref: BackerCampaignNotificationPreference
  ): Promise<BackerCampaignNotificationPreference> {
    const copy = { ...pref };
    this.store.set(this.key(pref.backerAddress, pref.campaignId), copy);
    return { ...copy };
  }

  async saveMany(
    prefs: BackerCampaignNotificationPreference[]
  ): Promise<BackerCampaignNotificationPreference[]> {
    const results: BackerCampaignNotificationPreference[] = [];
    for (const p of prefs) {
      const saved = await this.save(p);
      results.push(saved);
    }
    return results;
  }
}

let dataSourceInstance: BackerNotificationPreferencesDataSource | undefined;

export function getBackerNotificationDataSource(): BackerNotificationPreferencesDataSource {
  return (dataSourceInstance ??= new InMemoryBackerNotificationPreferencesDataSource());
}

export function setBackerNotificationDataSource(
  ds: BackerNotificationPreferencesDataSource
): void {
  dataSourceInstance = ds;
}

export class BackerNotificationService {
  constructor(
    private dataSource: BackerNotificationPreferencesDataSource = getBackerNotificationDataSource()
  ) {}

  /**
   * Helper to ensure valid and complete EventChannelPreferences
   */
  public normalizePreferences(
    prefs?: Partial<Record<CampaignNotificationEvent, Partial<ChannelPreferences>>>
  ): EventChannelPreferences {
    const result: EventChannelPreferences = {
      updates: { ...DEFAULT_EVENT_PREFERENCES.updates },
      milestones: { ...DEFAULT_EVENT_PREFERENCES.milestones },
      end_of_campaign: { ...DEFAULT_EVENT_PREFERENCES.end_of_campaign },
      reward_shipped: { ...DEFAULT_EVENT_PREFERENCES.reward_shipped },
    };

    if (!prefs) return result;

    for (const event of CAMPAIGN_NOTIFICATION_EVENTS) {
      if (prefs[event]) {
        for (const channel of NOTIFICATION_CHANNELS) {
          if (typeof prefs[event]?.[channel] === "boolean") {
            result[event][channel] = prefs[event]![channel]!;
          }
        }
      }
    }

    return result;
  }

  /**
   * Get preferences for a backer and campaign, returning defaults if not configured yet.
   */
  async getPreferences(
    backerAddress: string,
    campaignId: string,
    campaignTitle?: string
  ): Promise<BackerCampaignNotificationPreference> {
    if (!backerAddress) throw new Error("backerAddress is required");
    if (!campaignId) throw new Error("campaignId is required");

    const existing = await this.dataSource.get(backerAddress, campaignId);
    if (existing) return existing;

    const now = Date.now();
    return {
      id: `pref-${backerAddress.slice(0, 8)}-${campaignId}`,
      backerAddress,
      campaignId,
      campaignTitle: campaignTitle || `Campaign #${campaignId}`,
      preferences: this.normalizePreferences(),
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * List all campaign notification preferences for a backer.
   */
  async getBackerCampaignPreferences(
    backerAddress: string
  ): Promise<BackerCampaignNotificationPreference[]> {
    if (!backerAddress) return [];
    return this.dataSource.getByBacker(backerAddress);
  }

  /**
   * Update or create preferences for a backer on a specific campaign.
   */
  async updateCampaignPreference(params: {
    backerAddress: string;
    campaignId: string;
    campaignTitle?: string;
    preferences: Partial<Record<CampaignNotificationEvent, Partial<ChannelPreferences>>>;
    email?: string;
    pushEndpoint?: string;
  }): Promise<BackerCampaignNotificationPreference> {
    const { backerAddress, campaignId, campaignTitle, preferences, email, pushEndpoint } = params;

    if (!backerAddress) throw new Error("backerAddress is required");
    if (!campaignId) throw new Error("campaignId is required");

    const existing = await this.dataSource.get(backerAddress, campaignId);
    const now = Date.now();

    const mergedPrefs: EventChannelPreferences = existing
      ? { ...existing.preferences }
      : this.normalizePreferences();

    for (const event of CAMPAIGN_NOTIFICATION_EVENTS) {
      if (preferences[event]) {
        mergedPrefs[event] = {
          ...mergedPrefs[event],
          ...preferences[event],
        };
      }
    }

    const record: BackerCampaignNotificationPreference = {
      id: existing?.id || `pref-${backerAddress.slice(0, 8)}-${campaignId}`,
      backerAddress,
      campaignId,
      campaignTitle: campaignTitle || existing?.campaignTitle || `Campaign #${campaignId}`,
      preferences: mergedPrefs,
      email: email !== undefined ? email : existing?.email,
      pushEndpoint: pushEndpoint !== undefined ? pushEndpoint : existing?.pushEndpoint,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };

    return this.dataSource.save(record);
  }

  /**
   * Update preferences in bulk across all backed campaigns or a specified subset.
   */
  async bulkUpdatePreferences(
    input: BulkUpdatePreferencesInput,
    backedCampaigns: BackedCampaignSummary[] = []
  ): Promise<BackerCampaignNotificationPreference[]> {
    const { backerAddress, campaignIds, preferences, email, pushEndpoint } = input;
    if (!backerAddress) throw new Error("backerAddress is required");

    // Determine target campaign IDs:
    let targets: Array<{ id: string; title: string }> = [];

    if (campaignIds && campaignIds.length > 0) {
      targets = campaignIds.map((cid) => {
        const found = backedCampaigns.find((b) => b.campaignId === cid);
        return {
          id: cid,
          title: found?.campaignTitle || `Campaign #${cid}`,
        };
      });
    } else if (backedCampaigns.length > 0) {
      targets = backedCampaigns.map((b) => ({
        id: b.campaignId,
        title: b.campaignTitle,
      }));
    } else {
      // Fallback to already existing preferences in data source
      const existing = await this.dataSource.getByBacker(backerAddress);
      targets = existing.map((p) => ({
        id: p.campaignId,
        title: p.campaignTitle || `Campaign #${p.campaignId}`,
      }));
    }

    const updatedList: BackerCampaignNotificationPreference[] = [];

    for (const target of targets) {
      const updated = await this.updateCampaignPreference({
        backerAddress,
        campaignId: target.id,
        campaignTitle: target.title,
        preferences,
        email,
        pushEndpoint,
      });
      updatedList.push(updated);
    }

    return updatedList;
  }

  /**
   * Determines if a notification should be delivered to a backer for a specific event & channel.
   */
  async shouldDeliver(params: {
    backerAddress: string;
    campaignId: string;
    event: CampaignNotificationEvent;
    channel: NotificationChannel;
  }): Promise<boolean> {
    const { backerAddress, campaignId, event, channel } = params;
    const pref = await this.getPreferences(backerAddress, campaignId);
    return Boolean(pref.preferences[event]?.[channel]);
  }
}

export const backerNotificationService = new BackerNotificationService();
