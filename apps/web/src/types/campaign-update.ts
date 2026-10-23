/**
 * Types for Campaign Updates — rich-text progress posts a creator publishes
 * on a campaign during (and after) the campaign is live.
 *
 * An update is a markdown-authored post with optional uploaded images. When it
 * is published it can notify the campaign's backers, either instantly or
 * rolled up into a daily/weekly digest depending on each backer's preference.
 */

/** Lifecycle of an update post. */
export type CampaignUpdateStatus = "draft" | "published" | "archived";

/** Who can read an update once it is published. */
export type CampaignUpdateVisibility = "public" | "backers_only";

/**
 * How a backer wants to hear about new updates.
 * `instant` sends one email per update; the digest modes batch updates into
 * a single email; `off` disables email entirely (in-app still works).
 */
export type CampaignUpdateNotificationMode =
  | "instant"
  | "daily_digest"
  | "weekly_digest"
  | "off";

export const CAMPAIGN_UPDATE_NOTIFICATION_MODES: readonly CampaignUpdateNotificationMode[] =
  ["instant", "daily_digest", "weekly_digest", "off"];

export const CAMPAIGN_UPDATE_NOTIFICATION_MODE_LABELS: Record<
  CampaignUpdateNotificationMode,
  string
> = {
  instant: "Instantly",
  daily_digest: "Daily digest",
  weekly_digest: "Weekly digest",
  off: "No email",
};

/** Maximum length of an update title. */
export const MAX_CAMPAIGN_UPDATE_TITLE_LENGTH = 200;

/** Maximum length of the markdown body of an update. */
export const MAX_CAMPAIGN_UPDATE_BODY_LENGTH = 50_000;

/** Maximum number of images that can be attached to a single update. */
export const MAX_CAMPAIGN_UPDATE_IMAGES = 10;

export interface CampaignUpdatePost {
  id: string;
  campaignId: string;
  /** Stellar address of the creator who authored the update. */
  creatorAddress: string;
  title: string;
  /** Markdown source of the post body. */
  bodyMarkdown: string;
  /** Plain-text summary used in feeds and email digests. */
  excerpt?: string;
  /** Publicly reachable URLs of images uploaded for this update. */
  imageUrls: string[];
  tags: string[];
  status: CampaignUpdateStatus;
  visibility: CampaignUpdateVisibility;
  /** Whether publishing this update should notify the campaign's backers. */
  notifyBackers: boolean;
  /** Default notification mode applied to backers without a stored preference. */
  notificationMode: CampaignUpdateNotificationMode;
  createdAt: number;
  updatedAt: number;
  /** Epoch ms the post went live. Unset while the post is a draft. */
  publishedAt?: number;
}

export interface CampaignUpdateFilter {
  campaignId?: string;
  creatorAddress?: string;
  status?: CampaignUpdateStatus;
  visibility?: CampaignUpdateVisibility;
  /** Free-text search across title, body and excerpt. */
  search?: string;
}

export interface CampaignUpdateQueryInput {
  filter?: CampaignUpdateFilter;
  limit?: number;
  offset?: number;
  /**
   * Ordering for the feed. `"chronological"` returns oldest-first (the order
   * updates were published); `"reverse_chronological"` returns newest-first.
   */
  order?: "chronological" | "reverse_chronological";
}

/** A backer's per-campaign notification preference for campaign updates. */
export interface CampaignUpdatePreference {
  /** Backer wallet address or account id. */
  backerId: string;
  campaignId: string;
  /** Delivery address for email notifications. */
  email?: string;
  mode: CampaignUpdateNotificationMode;
  /** Whether updates should also appear in the in-app notification centre. */
  inAppEnabled: boolean;
  /** IANA timezone used to resolve the local digest delivery time. */
  timezone: string;
  /** Local-date key of the last delivered digest period. */
  lastSentPeriod?: string;
  /** Epoch ms of the last delivered digest (0 = never). */
  lastSentAt: number;
  createdAt: number;
  updatedAt: number;
}

/** An in-app notification delivered to a backer. */
export interface InAppNotification {
  id: string;
  /** Recipient (backer) wallet address or account id. */
  recipientId: string;
  campaignId: string;
  /** Update that triggered the notification, when there is one. */
  updateId?: string;
  kind: "campaign_update" | "ambassador_reward" | "ambassador_invite";
  title: string;
  body: string;
  /** Relative or absolute link the notification points at. */
  link?: string;
  read: boolean;
  createdAt: number;
}

/** Result of a publish + fan-out attempt. */
export interface CampaignUpdateDispatchReport {
  updateId: string;
  /** Backers notified instantly (email sent for this update). */
  instantNotified: number;
  /** Backers who will receive the update in a later digest. */
  queuedForDigest: number;
  /** In-app notifications created. */
  inAppNotified: number;
  /** Backers whose preferred digest period has already been sent. */
  skippedAlreadyNotified: number;
  /** Non-fatal delivery failures. */
  errors: string[];
}

export function isCampaignUpdateNotificationMode(
  value: unknown,
): value is CampaignUpdateNotificationMode {
  return (
    typeof value === "string" &&
    (CAMPAIGN_UPDATE_NOTIFICATION_MODES as readonly string[]).includes(value)
  );
}
