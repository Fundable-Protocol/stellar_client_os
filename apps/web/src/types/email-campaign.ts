/**
 * Types for the email campaign builder and send system.
 *
 * Allows campaign creators to build styled emails with a drag-and-drop block
 * editor, segment their backer list by reward tier or pledge amount, send
 * campaigns, and track open/click analytics per send.
 */

// ─── Block-level types (drag-and-drop builder) ────────────────────────────────

export type EmailBlockType =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer";

export interface HeadingBlock {
  type: "heading";
  id: string;
  content: string;
  /** h1 | h2 | h3 */
  level: 1 | 2 | 3;
  align: "left" | "center" | "right";
}

export interface TextBlock {
  type: "text";
  id: string;
  content: string;
  align: "left" | "center" | "right";
}

export interface ImageBlock {
  type: "image";
  id: string;
  /** Public URL of the image. */
  src: string;
  alt: string;
  /** Optional click-through URL. */
  link?: string;
  width?: number;
}

export interface ButtonBlock {
  type: "button";
  id: string;
  label: string;
  href: string;
  /** Hex color or CSS color value for the button background. */
  backgroundColor: string;
  textColor: string;
  align: "left" | "center" | "right";
}

export interface DividerBlock {
  type: "divider";
  id: string;
  color: string;
}

export interface SpacerBlock {
  type: "spacer";
  id: string;
  /** Height in pixels. */
  height: number;
}

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock;

// ─── Audience segmentation ────────────────────────────────────────────────────

/**
 * An audience segment specifies which backers receive the campaign.
 * All specified filters are AND-ed together; omit a filter to include all.
 */
export interface AudienceSegment {
  /** Target only backers in specific reward tiers (by name). */
  rewardTiers?: string[];
  /**
   * Minimum pledge amount filter (in the campaign's token, decimal string).
   * Only backers whose total pledge is >= this value are included.
   */
  minPledgeAmount?: string;
  /**
   * Maximum pledge amount filter (in the campaign's token, decimal string).
   * Only backers whose total pledge is <= this value are included.
   */
  maxPledgeAmount?: string;
  /**
   * When true, include all backers regardless of other filters.
   * This overrides rewardTiers, minPledgeAmount, and maxPledgeAmount.
   */
  includeAll?: boolean;
}

// ─── Email campaign record ─────────────────────────────────────────────────────

export type EmailCampaignStatus = "draft" | "scheduled" | "sent" | "failed";

export interface EmailCampaign {
  id: string;
  campaignId: string;
  /** Campaign creator's Stellar address. */
  creatorAddress: string;
  subject: string;
  /** Optional preview text shown in email clients below the subject. */
  previewText?: string;
  blocks: EmailBlock[];
  audience: AudienceSegment;
  status: EmailCampaignStatus;
  createdAt: number; // Unix ms
  updatedAt: number; // Unix ms
  /** ISO 8601 datetime at which this should be sent (null = immediate). */
  scheduledAt?: string;
  /** Populated after the campaign is sent. */
  sendRecord?: EmailCampaignSendRecord;
}

// ─── Send record ──────────────────────────────────────────────────────────────

export interface EmailCampaignSendRecord {
  emailCampaignId: string;
  sentAt: number; // Unix ms
  /** Number of addresses the campaign was dispatched to. */
  recipientCount: number;
  /** Any delivery errors encountered during the send. */
  errors: SendError[];
}

export interface SendError {
  email: string;
  reason: string;
}

// ─── Analytics ────────────────────────────────────────────────────────────────

/**
 * A single tracked event emitted when a recipient opens an email or clicks
 * a link inside it.
 */
export type TrackingEventType = "open" | "click";

export interface EmailTrackingEvent {
  id: string;
  emailCampaignId: string;
  /** Hashed recipient email for privacy. */
  recipientHash: string;
  type: TrackingEventType;
  /** Present for click events — the URL that was clicked. */
  url?: string;
  occurredAt: number; // Unix ms
}

export interface EmailCampaignAnalytics {
  emailCampaignId: string;
  recipientCount: number;
  uniqueOpens: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
  /** Unique opens / recipientCount, as a percentage 0–100. */
  openRate: number;
  /** Unique clicks / recipientCount, as a percentage 0–100. */
  clickRate: number;
  /** Top clicked URLs with their click counts. */
  topLinks: Array<{ url: string; clicks: number }>;
  lastUpdatedAt: number; // Unix ms
}

// ─── Input types (service layer) ──────────────────────────────────────────────

export interface CreateEmailCampaignInput {
  campaignId: string;
  creatorAddress: string;
  subject: string;
  previewText?: string;
  blocks?: EmailBlock[];
  audience?: AudienceSegment;
  scheduledAt?: string;
}

export interface UpdateEmailCampaignInput {
  subject?: string;
  previewText?: string;
  blocks?: EmailBlock[];
  audience?: AudienceSegment;
  scheduledAt?: string;
}

export interface RecordTrackingEventInput {
  emailCampaignId: string;
  recipientHash: string;
  type: TrackingEventType;
  url?: string;
}
