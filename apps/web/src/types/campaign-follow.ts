/**
 * Types for Campaign Follow — Issue #942 (v1)
 *
 * Lets users 'follow' a campaign to get progress updates WITHOUT
 * sponsoring it — building an audience for campaigns before launch.
 * Deliberately separate from sponsorship/backing: a follow is a
 * zero-cost signal of interest with its own notification preferences.
 */

/** How a follower wants to be notified about campaign progress. */
export type FollowChannel = "EMAIL" | "IN_APP" | "WEBHOOK";

export const FOLLOW_CHANNELS: Record<
  FollowChannel,
  { label: string; hint: string }
> = {
  EMAIL: {
    label: "Email",
    hint: "name@example.com",
  },
  IN_APP: {
    label: "In-app",
    hint: "Notifications show up in your Fundable dashboard",
  },
  WEBHOOK: {
    label: "Webhook",
    hint: "https://example.com/hooks/fundable",
  },
};

/**
 * Milestone events a follower can subscribe to. v1 ships a small,
 * campaign-agnostic set; per-campaign custom events can come later.
 */
export type FollowEvent =
  | "MILESTONE_REACHED"
  | "FUNDS_RECEIVED"
  | "CAMPAIGN_COMPLETED"
  | "CAMPAIGN_LAUNCHED";

export const FOLLOW_EVENTS: Record<FollowEvent, string> = {
  MILESTONE_REACHED: "Funding milestones reached (25/50/75/100%)",
  FUNDS_RECEIVED: "Milestone funds released to the creator",
  CAMPAIGN_COMPLETED: "Campaign successfully completed",
  CAMPAIGN_LAUNCHED: "Campaign goes live",
};

export type FollowFrequency = "INSTANT" | "DAILY_DIGEST" | "WEEKLY_DIGEST";

/** Frequency labels for UI display. */
export const FOLLOW_FREQUENCIES: Record<FollowFrequency, string> = {
  INSTANT: "Instant",
  DAILY_DIGEST: "Daily digest",
  WEEKLY_DIGEST: "Weekly digest",
};

/** Notification preferences attached to a follow. */
export interface FollowNotificationPrefs {
  /** Primary channel for progress updates. */
  channel: FollowChannel;
  /** Delivery frequency. Digests batch the same events together. */
  frequency: FollowFrequency;
  /**
   * Delivery target for the channel: an email address for EMAIL, an
   * HTTPS endpoint for WEBHOOK. Unused for IN_APP.
   */
  destination?: string;
  /** Which events the follower opted into (defaults to all). */
  events: FollowEvent[];
}

export interface CampaignFollow {
  id: string;
  campaignId: string;
  /** Stellar address of the follower. */
  followerAddress: string;
  prefs: FollowNotificationPrefs;
  createdAt: number; // timestamp ms
}

export interface FollowCampaignInput {
  campaignId: string;
  followerAddress: string;
  prefs?: Partial<FollowNotificationPrefs>;
}

export const DEFAULT_FOLLOW_EVENTS: FollowEvent[] = [
  "MILESTONE_REACHED",
  "FUNDS_RECEIVED",
  "CAMPAIGN_COMPLETED",
  "CAMPAIGN_LAUNCHED",
];

export const DEFAULT_FOLLOW_PREFS: FollowNotificationPrefs = {
  channel: "IN_APP",
  frequency: "INSTANT",
  events: [...DEFAULT_FOLLOW_EVENTS],
};

/** Platform/channel metadata used by UI + validation (label, target check). */
export function validateFollowDestination(
  channel: FollowChannel,
  destination: string
): boolean {
  const value = destination.trim();
  switch (channel) {
    case "EMAIL":
      // Pragmatic email shape: local@domain.tld (no spaces/commas).
      return !!value && /^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(value);
    case "WEBHOOK":
      return !!value && /^https:\/\/[\w.-]+(:\d+)?(\/[\w\-./?%&=]*)?$/.test(value);
    case "IN_APP":
      // In-app notifications need no external destination.
      return true;
  }
}
