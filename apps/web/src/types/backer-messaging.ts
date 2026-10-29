/**
 * Backer Messaging System Types — Issue #1206
 *
 * Enable campaign creators to send direct messages to individual backers or
 * broadcast messages to all backers of a specific reward tier.
 */

export type MessageRecipientType = "INDIVIDUAL" | "TIER" | "ALL_BACKERS";
export type MessageStatus = "DRAFT" | "SENT" | "FAILED";

export interface BackerMessage {
  id: string;
  campaignId: string;
  creatorAddress: string;
  recipientType: MessageRecipientType;
  /** Reward tier ID when recipientType is TIER. */
  tierId?: string;
  /** Backer wallet address when recipientType is INDIVIDUAL. */
  backerAddress?: string;
  subject: string;
  body: string;
  status: MessageStatus;
  sentAt?: number;
  recipientCount?: number;
  createdAt: number;
}

export interface SendMessageInput {
  campaignId: string;
  creatorAddress: string;
  recipientType: MessageRecipientType;
  tierId?: string;
  backerAddress?: string;
  subject: string;
  body: string;
}

export const MESSAGE_SUBJECT_MAX_LENGTH = 150;
export const MESSAGE_BODY_MAX_LENGTH = 4000;

export const RECIPIENT_TYPE_LABELS: Record<MessageRecipientType, string> = {
  INDIVIDUAL: "Individual backer",
  TIER: "All backers in a reward tier",
  ALL_BACKERS: "All backers",
};
