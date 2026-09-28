export const CAMPAIGN_WEBHOOK_EVENTS = [
  "tree_verified",
  "batch_verified",
  "campaign_milestone_reached",
  "campaign_completed",
] as const;

export type CampaignWebhookEvent = (typeof CAMPAIGN_WEBHOOK_EVENTS)[number];

export interface TreeVerifiedEvent {
  verificationId: string;
  treeId: string;
  campaignId: string;
  verifiedAt: string;
  verifier?: string;
  nullifier?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

export interface BatchVerifiedEvent {
  batchId: string;
  campaignId: string;
  treeIds: string[];
  verifiedAt: string;
  verifier?: string;
  txHash?: string;
  metadata?: Record<string, unknown>;
}

export interface CampaignMilestoneReachedEvent {
  eventId: string;
  campaignId: string;
  campaignName?: string;
  milestone?: number;
  percentage?: number;
  raisedAmount?: string;
  goalAmount?: string;
  treeCount?: number;
}

export interface CampaignCompletedEvent {
  completionId: string;
  campaignId: string;
  completedAt: string;
  treeCount?: number;
  raisedAmount?: string;
  goalAmount?: string;
  metadata?: Record<string, unknown>;
}
