import { randomUUID } from "node:crypto";
import { EmailService } from "@/services/email.service";
import {
  CampaignFollow,
  CampaignFollowPreferences,
  CreateCampaignFollowInput,
  DEFAULT_FOLLOW_EVENTS,
  DEFAULT_FOLLOW_PREFS,
  FollowCampaignInput,
  FollowChannel,
  FollowEvent,
  FollowFrequency,
  FollowNotificationPrefs,
  FOLLOW_CHANNELS,
  FOLLOW_EVENTS,
  FOLLOW_FREQUENCIES,
  validateFollowDestination,
} from "@/types/campaign-follow";

const DEFAULT_PREFERENCES: CampaignFollowPreferences = {
  milestoneUpdates: true,
  verificationUpdates: true,
  completionUpdates: true,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * CampaignFollowService — Unified follow service supporting email-based
 * and Stellar-wallet-based follows for campaign progress updates.
 */
export class CampaignFollowService {
  private follows = new Map<string, CampaignFollow[]>();
  private sequence = new Map<string, number>();

  /**
   * Follow a campaign. Supports either { email, ... } or { followerAddress, ... }.
   */
  follow(
    input: CreateCampaignFollowInput | FollowCampaignInput,
    now = Date.now()
  ): CampaignFollow {
    if (!input.campaignId?.trim()) throw new Error("campaignId is required");

    const current = this.follows.get(input.campaignId) ?? [];

    if ("email" in input && input.email) {
      const email = this.normalizeEmail(input.email);
      const existing = current.find(
        (f) => f.email?.toLowerCase() === email
      );

      if (existing) {
        existing.walletAddress = input.walletAddress?.trim() || existing.walletAddress;
        existing.preferences = this.mergePreferences(
          existing.preferences ?? DEFAULT_PREFERENCES,
          input.preferences
        );
        existing.updatedAt = now;
        return existing;
      }

      const follow: CampaignFollow = {
        id: `follow_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
        campaignId: input.campaignId,
        email,
        walletAddress: input.walletAddress?.trim() || undefined,
        preferences: this.mergePreferences(DEFAULT_PREFERENCES, input.preferences),
        prefs: DEFAULT_FOLLOW_PREFS,
        createdAt: now,
        updatedAt: now,
      };

      current.push(follow);
      this.follows.set(input.campaignId, current);
      return follow;
    }

    if ("followerAddress" in input) {
      if (!input.followerAddress?.trim()) throw new Error("followerAddress is required");
      const followerAddress = input.followerAddress.trim();
      const prefs = normalizePrefs(input.prefs);

      const existing = current.find(
        (f) => f.followerAddress?.toLowerCase() === followerAddress.toLowerCase()
      );

      if (existing) {
        existing.prefs = prefs;
        existing.updatedAt = now;
        return existing;
      }

      const follow: CampaignFollow = {
        id: `follow-${now}-${Math.random().toString(36).substring(2, 8)}`,
        campaignId: input.campaignId,
        followerAddress,
        prefs,
        preferences: DEFAULT_PREFERENCES,
        createdAt: now,
        updatedAt: now,
      };

      current.push(follow);
      this.follows.set(input.campaignId, current);
      return follow;
    }

    throw new Error("Either email or followerAddress is required to follow");
  }

  /**
   * Unfollow a campaign by email or followerAddress.
   */
  unfollow(campaignId: string, emailOrAddress: string): boolean {
    const list = this.follows.get(campaignId) ?? [];
    const target = emailOrAddress.trim().toLowerCase();

    const remaining = list.filter((f) => {
      const matchesEmail = f.email && f.email.toLowerCase() === target;
      const matchesAddress =
        f.followerAddress && f.followerAddress.toLowerCase() === target;
      return !matchesEmail && !matchesAddress;
    });

    if (remaining.length === list.length) return false;
    this.follows.set(campaignId, remaining);
    return true;
  }

  /** Returns all follows for a campaign. */
  getFollows(campaignId: string): CampaignFollow[] {
    return this.follows.get(campaignId) || [];
  }

  /** Backward-compatible alias for getFollows. */
  getFollowers(campaignId: string): CampaignFollow[] {
    return this.getFollows(campaignId);
  }

  /** Follows belonging to one wallet across all campaigns. */
  getFollowsFor(followerAddress: string): CampaignFollow[] {
    const result: CampaignFollow[] = [];
    const target = followerAddress.toLowerCase();
    for (const list of this.follows.values()) {
      result.push(
        ...list.filter(
          (f) => f.followerAddress && f.followerAddress.toLowerCase() === target
        )
      );
    }
    return result;
  }

  /** Retrieve a single follow by email or wallet address. */
  getFollow(campaignId: string, emailOrAddress: string): CampaignFollow | null {
    const target = emailOrAddress.trim().toLowerCase();
    return (
      this.getFollows(campaignId).find((f) => {
        const matchesEmail = f.email && f.email.toLowerCase() === target;
        const matchesAddress =
          f.followerAddress && f.followerAddress.toLowerCase() === target;
        return matchesEmail || matchesAddress;
      }) || null
    );
  }

  isFollowing(campaignId: string, followerAddress: string): boolean {
    return this.getFollow(campaignId, followerAddress) !== null;
  }

  /** Audience size for a campaign. */
  getFollowerCount(campaignId: string): number {
    return this.getFollows(campaignId).length;
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
    follow.updatedAt = Date.now();
    return follow;
  }

  async notifyFollowers(
    campaignId: string,
    subject: string,
    html: string,
    preference: keyof CampaignFollowPreferences,
    emailService = new EmailService(),
  ): Promise<number> {
    const recipients = this.getFollowers(campaignId).filter(
      (follow) => follow.email && follow.preferences?.[preference]
    );
    await Promise.all(
      recipients.map((follow) =>
        emailService.sendEmail({ to: follow.email!, subject, html })
      )
    );
    return recipients.length;
  }

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
        occurredAt: Date.now() - (seq + 1) * 36 * 60 * 60 * 1000,
      });
    }
    this.sequence.set(campaignIdSafe, next + total);
    return events;
  }

  reset(): void {
    this.follows.clear();
    this.sequence.clear();
  }

  private normalizeEmail(email: string): string {
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !EMAIL_PATTERN.test(normalized)) {
      throw new Error("A valid email is required");
    }
    return normalized;
  }

  private mergePreferences(
    current: CampaignFollowPreferences,
    updates?: Partial<CampaignFollowPreferences>,
  ): CampaignFollowPreferences {
    return {
      milestoneUpdates: updates?.milestoneUpdates ?? current.milestoneUpdates,
      verificationUpdates: updates?.verificationUpdates ?? current.verificationUpdates,
      completionUpdates: updates?.completionUpdates ?? current.completionUpdates,
    };
  }
}

export const campaignFollowService = new CampaignFollowService();
export const followService = campaignFollowService;

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
