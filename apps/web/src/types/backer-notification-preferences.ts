/**
 * Types for Backer Notification Preferences per-campaign and bulk management.
 *
 * Backers can configure which campaign events trigger:
 * - email
 * - in_app
 * - push
 *
 * Supported campaign events:
 * - updates: Creator updates, announcements
 * - milestones: Progress/milestones reached
 * - end_of_campaign: Campaign finished/deadline reached
 * - reward_shipped: Physical/digital reward dispatched or fulfilled
 */

export const NOTIFICATION_CHANNELS = ["email", "in_app", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const CAMPAIGN_NOTIFICATION_EVENTS = [
  "updates",
  "milestones",
  "end_of_campaign",
  "reward_shipped",
] as const;
export type CampaignNotificationEvent = (typeof CAMPAIGN_NOTIFICATION_EVENTS)[number];

export type ChannelPreferences = {
  [K in NotificationChannel]: boolean;
};

export type EventChannelPreferences = {
  [E in CampaignNotificationEvent]: ChannelPreferences;
};

export interface BackerCampaignNotificationPreference {
  id: string;
  backerAddress: string;
  campaignId: string;
  campaignTitle?: string;
  preferences: EventChannelPreferences;
  email?: string;
  pushEndpoint?: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_CHANNEL_PREFERENCES: ChannelPreferences = {
  email: true,
  in_app: true,
  push: false,
};

export const DEFAULT_EVENT_PREFERENCES: EventChannelPreferences = {
  updates: { email: true, in_app: true, push: false },
  milestones: { email: true, in_app: true, push: true },
  end_of_campaign: { email: true, in_app: true, push: true },
  reward_shipped: { email: true, in_app: true, push: true },
};

export interface BulkUpdatePreferencesInput {
  backerAddress: string;
  campaignIds?: string[]; // If omitted or empty, applies to all backed campaigns
  preferences: Partial<Record<CampaignNotificationEvent, Partial<ChannelPreferences>>>;
  email?: string;
  pushEndpoint?: string;
}

export interface BackedCampaignSummary {
  campaignId: string;
  campaignTitle: string;
  amountBacked?: string;
  currency?: string;
  status?: string;
}
