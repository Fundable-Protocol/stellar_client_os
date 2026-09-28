import {
  CampaignFollow,
  DEFAULT_FOLLOW_EVENTS,
  DEFAULT_FOLLOW_PREFS,
  FollowCampaignInput,
  FollowEvent,
  FollowNotificationPrefs,
  FollowFrequency,
  FollowChannel,
  FOLLOW_CHANNELS,
  FOLLOW_EVENTS,
  FOLLOW_FREQUENCIES,
  validateFollowDestination,
} from "@/types/campaign-follow";

/**
 * Campaign follows — Issue #942 (v1).
 *
 * Users follow a campaign to receive progress updates WITHOUT sponsoring
 * it. v1 keeps follows in memory (same singleton pattern as
 * campaign-community.service / campaign-collaboration.service) until a
 * persistent data source lands; the API surface is designed so a durable
 * store can slot in behind the same methods.
 */
class CampaignFollowService {
  private follows = new Map<string, CampaignFollow[]>();
  /** Sequence numbers per campaign for the digest preview (newest first). */
  private sequence = new Map<string, number>();

  /** All follows for a campaign (audience view, e.g. for creators). */
  getFollows(campaignId: string): CampaignFollow[] {
    return this.follows.get(campaignId) || [];
  }

  /** Follows belonging to one wallet across all campaigns. */
  getFollowsFor(followerAddress: string): CampaignFollow[] {
    const result: CampaignFollow[] = [];
    for (const list of this.follows.values()) {
      result.push(
        ...list.filter(
          (f) => f.followerAddress.toLowerCase() === followerAddress.toLowerCase()
        )
      );
    }
    return result;
  }

  getFollow(campaignId: string, followerAddress: string): CampaignFollow | null {
    return (
      this.getFollows(campaignId).find(
        (f) => f.followerAddress.toLowerCase() === followerAddress.toLowerCase()
      ) || null
    );
  }

  isFollowing(campaignId: string, followerAddress: string): boolean {
    return this.getFollow(campaignId, followerAddress) !== null;
  }

  /** Audience size for a campaign — the metric this feature exists for. */
  getFollowerCount(campaignId: string): number {
    return this.getFollows(campaignId).length;
  }

  /**
   * Follow a campaign. Idempotent: an existing follow for the same wallet
   * is updated (re-preferenced) rather than duplicated. Returns the follow.
   */
  follow(input: FollowCampaignInput): CampaignFollow {
    if (!input.campaignId?.trim()) throw new Error("campaignId is required");
    if (!input.followerAddress?.trim()) throw new Error("followerAddress is required");

    const prefs = normalizePrefs(input.prefs);
    const existing = this.getFollow(input.campaignId, input.followerAddress);

    if (existing) {
      existing.prefs = prefs;
      return existing;
    }

    const follow: CampaignFollow = {
      id: `follow-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      campaignId: input.campaignId,
      followerAddress: input.followerAddress,
      prefs,
      createdAt: Date.now(),
    };
    const list = this.follows.get(input.campaignId) || [];
    list.push(follow);
    this.follows.set(input.campaignId, list);
    return follow;
  }

  /** Update notification preferences for an existing follow. */
  updatePrefs(
    campaignId: string,
    followerAddress: string,
    prefs: Partial<FollowNotificationPrefs>
  ): CampaignFollow | null {
    const follow = this.getFollow(campaignId, followerAddress);
    if (!follow) return null;
    follow.prefs = normalizePrefs({ ...follow.prefs, ...prefs });
    return follow;
  }

  /** Unfollow. Returns true when a follow was removed. */
  unfollow(campaignId: string, followerAddress: string): boolean {
    const list = this.follows.get(campaignId) || [];
    const updated = list.filter(
      (f) => f.followerAddress.toLowerCase() !== followerAddress.toLowerCase()
    );
    this.follows.set(campaignId, updated);
    return updated.length !== list.length;
  }

  /**
   * Simulated progress-update feed used by the UI to show what a follower
   * will receive. v1 generates deterministic demo events per campaign; a
   * later PR (#942 v2) will source these from real campaign events.
   */
  getUpdatePreview(campaignId: string, limit = 5): FollowUpdatePreview[] {
    const campaignIdSafe = campaignId?.trim();
    if (!campaignIdSafe) return [];
    const total = Math.min(limit, 5);
    const next = this.sequence.get(campaignIdSafe) ?? 0;
    const events: FollowUpdatePreview[] = [];
    for (let i = 0; i < total; i++) {
      const seq = next + i;
      const template = DEMO_UPDATES[seq % DEMO_UPDATES.length];
      events.push({
        id: `${campaignIdSafe}-update-${seq}`,
        campaignId: campaignIdSafe,
        event: template.event,
        message: template.message,
        occurredAt: Date.now() - (seq + 1) * 36 * 60 * 60 * 1000, // ~daily, newest first
      });
    }
    this.sequence.set(campaignIdSafe, next + total);
    return events;
  }

  /** Test seam — clears all in-memory state. */
  reset(): void {
    this.follows.clear();
    this.sequence.clear();
  }
}

export interface FollowUpdatePreview {
  id: string;
  campaignId: string;
  event: FollowEvent;
  message: string;
  occurredAt: number;
}

const DEMO_UPDATES: { event: FollowEvent; message: string }[] = [
  { event: "MILESTONE_REACHED", message: "Campaign reached the 50% funding milestone." },
  { event: "FUNDS_RECEIVED", message: "Milestone 1 funds released to the creator." },
  { event: "MILESTONE_REACHED", message: "Campaign reached the 75% funding milestone." },
  { event: "CAMPAIGN_COMPLETED", message: "Campaign completed successfully — all milestones hit." },
  { event: "CAMPAIGN_LAUNCHED", message: "Campaign is live and accepting sponsors." },
];

function normalizePrefs(
  prefs: Partial<FollowNotificationPrefs> | undefined
): FollowNotificationPrefs {
  // `events: []` is an explicit opt-out of every event and is rejected below;
  // only an omitted events list falls back to the defaults.
  const merged: FollowNotificationPrefs = {
    ...DEFAULT_FOLLOW_PREFS,
    ...prefs,
    events:
      prefs?.events !== undefined ? [...prefs.events] : [...DEFAULT_FOLLOW_EVENTS],
  };
  validatePrefs(merged);
  return merged;
}

function validatePrefs(prefs: FollowNotificationPrefs): void {
  if (!FOLLOW_CHANNELS[prefs.channel]) {
    throw new Error(`Unknown follow channel: ${prefs.channel}`);
  }
  if (!FOLLOW_FREQUENCIES[prefs.frequency]) {
    throw new Error(`Unknown follow frequency: ${prefs.frequency}`);
  }
  if (prefs.channel !== "IN_APP") {
    // EMAIL and WEBHOOK must carry a valid destination; IN_APP must not need one.
    const destination = (prefs.destination ?? "").trim();
    if (!destination || !validateFollowDestination(prefs.channel, destination)) {
      throw new Error(
        `Invalid destination for ${FOLLOW_CHANNELS[prefs.channel].label} channel (expected ${FOLLOW_CHANNELS[prefs.channel].hint})`
      );
    }
  }
  for (const event of prefs.events) {
    if (!FOLLOW_EVENTS[event]) {
      throw new Error(`Unknown follow event: ${event}`);
    }
  }
  if (!prefs.events.length) {
    throw new Error("At least one follow event must be selected");
  }
}

// Re-exported for convenience of route/hook/test imports.
export {
  DEFAULT_FOLLOW_EVENTS,
  DEFAULT_FOLLOW_PREFS,
  FOLLOW_CHANNELS,
  FOLLOW_EVENTS,
  FOLLOW_FREQUENCIES,
  validateFollowDestination,
};
export type {
  CampaignFollow,
  FollowCampaignInput,
  FollowEvent,
  FollowFrequency,
  FollowChannel,
  FollowNotificationPrefs,
};

export const followService = new CampaignFollowService();
