/**
 * External Webhook Integration Types for Telegram and Discord
 */

export type ExternalWebhookPlatform = "telegram" | "discord";

export type ExternalWebhookEvent =
  | "pledge.created"
  | "milestone.reached"
  | "stretch_goal.unlocked"
  | "refund.requested"
  | "campaign.completed";

export interface ExternalWebhookConfig {
  id: string;
  campaignId: string;
  platform: ExternalWebhookPlatform;
  webhookUrl: string;
  botToken?: string; // For Telegram
  enabled: boolean;
  events: ExternalWebhookEvent[];
  createdAt: string;
  updatedAt?: string;
}

export interface TelegramMessage {
  chat_id: string;
  text?: string;
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2";
  disable_notification?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: Array<{
    name: string;
    value: string;
    inline?: boolean;
  }>;
  footer?: {
    text: string;
    icon_url?: string;
  };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  content?: string;
  username?: string;
  avatar_url?: string;
  embeds?: DiscordEmbed[];
}

export interface PledgeEventData {
  campaignId: string;
  campaignName: string;
  backerNickname?: string;
  pledgedTier?: string;
  pledgeAmount: string;
  totalRaised: string;
  goalAmount: string;
  sponsorCount: number;
  percentFunded: number;
  txHash?: string;
}

export interface MilestoneEventData {
  campaignId: string;
  campaignName: string;
  percentage: number;
  totalRaised: string;
  goalAmount: string;
  sponsorCount: number;
}

export interface StretchGoalEventData {
  campaignId: string;
  campaignName: string;
  stretchGoalName: string;
  stretchGoalAmount: string;
  totalRaised: string;
}

export interface RefundEventData {
  campaignId: string;
  campaignName: string;
  backerAddress: string;
  refundAmount: string;
  reason: string;
}
