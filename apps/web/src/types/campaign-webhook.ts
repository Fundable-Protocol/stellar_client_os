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
  /** Funding percentage milestone (25, 50, 75, 100) */
  milestone?: number;
  percentage?: number;
  raisedAmount?: string;
  goalAmount?: string;
  treeCount?: number;
}

/**
 * Impact milestone types: tree count thresholds and CO2 sequestration targets
 */
export type ImpactMilestone = "1000_trees" | "5000_trees" | "10_tons_co2";

export interface CampaignImpactMilestoneEvent {
  eventId: string;
  campaignId: string;
  /** Milestone type: 1000_trees, 5000_trees, or 10_tons_co2 */
  milestone: ImpactMilestone;
  /** Total trees planted for this campaign */
  treeCount: number;
  /** Total CO2 sequestered in metric tonnes (decimal string), or null if unavailable */
  co2Sequestration: string | null;
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
