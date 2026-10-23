/**
 * Types for the Ambassador & Influencer Program.
 *
 * A creator recruits ambassadors who promote a campaign in exchange for
 * perks or a commission. Ambassadors are invited by email, every pledge they
 * bring in is tracked against them, and reaching a tier threshold assigns a
 * reward automatically.
 */

/** Lifecycle of an ambassador within a campaign's program. */
export type AmbassadorStatus =
  | "invited"
  | "active"
  | "paused"
  | "completed"
  | "declined";

/** Reward tier of the ambassador program. */
export type AmbassadorTier = "SEED" | "SPROUT" | "BLOOM" | "CANOPY";

export interface AmbassadorTierConfig {
  tier: AmbassadorTier;
  label: string;
  /** Minimum pledged amount (token units) required to unlock the tier. */
  minPledgeAmount: string;
  /** Perks unlocked when the tier is reached. */
  perks: string[];
  /** Commission paid on the pledged amount, in basis points (1% = 100 bps). */
  commissionRateBps: number;
}

export interface Ambassador {
  id: string;
  campaignId: string;
  name: string;
  email: string;
  /** Stellar address of the ambassador, once they connect a wallet. */
  stellarAddress?: string;
  tier: AmbassadorTier;
  status: AmbassadorStatus;
  /** Unique code the ambassador shares to attribute pledges. */
  referralCode: string;
  invitedBy: string;
  invitedByName?: string;
  createdAt: number;
  /** Epoch ms the ambassador accepted the invitation. */
  joinedAt?: number;
  /** Total pledged amount attributed to this ambassador, in token units. */
  pledgedAmount: string;
  /** Number of pledges recorded for this ambassador. */
  pledgeCount: number;
  /** Reward assigned when the current tier threshold was reached. */
  rewardId?: string;
}

export type AmbassadorInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface AmbassadorInvite {
  token: string;
  campaignId: string;
  campaignTitle: string;
  /** Email address the invitation was sent to. */
  email: string;
  /** Display name supplied by the creator when inviting. */
  name?: string;
  tier: AmbassadorTier;
  invitedBy: string;
  invitedByName: string;
  createdAt: number;
  expiresAt: number;
  status: AmbassadorInviteStatus;
  ambassadorId?: string;
  acceptedAt?: number;
}

export type AmbassadorPledgeSource = "referral_link" | "referral_code" | "direct";

export interface AmbassadorPledge {
  id: string;
  campaignId: string;
  ambassadorId: string;
  /** Wallet address of the backer who pledged. */
  backerAddress: string;
  /** Pledged amount in token units. */
  amount: string;
  token: string;
  source: AmbassadorPledgeSource;
  createdAt: number;
}

export type AmbassadorRewardType = "perk" | "commission";
export type AmbassadorRewardStatus = "assigned" | "fulfilled" | "revoked";

export interface AmbassadorReward {
  id: string;
  campaignId: string;
  ambassadorId: string;
  type: AmbassadorRewardType;
  tier: AmbassadorTier;
  /** Reward amount in token units (the commission for `commission` rewards). */
  amount: string;
  description: string;
  status: AmbassadorRewardStatus;
  /** Threshold that triggered the assignment. */
  thresholdAmount: string;
  assignedAt: number;
}

/** Per-ambassador view used by the pledge tracking dashboard. */
export interface AmbassadorPledgeSummary {
  ambassador: Ambassador;
  tier: AmbassadorTierConfig;
  pledgedAmount: string;
  pledgeCount: number;
  /** Progress towards the next tier, between 0 and 1. */
  progressToNextTier: number;
  /** The tier the ambassador is working towards, if any. */
  nextTier?: AmbassadorTierConfig;
  /** Amount still needed to reach the next tier. */
  amountToNextTier: string;
  rewards: AmbassadorReward[];
  /** Whether the current tier threshold has been met. */
  thresholdMet: boolean;
}

/** Aggregated numbers for the whole program. */
export interface AmbassadorProgramSummary {
  campaignId: string;
  totalAmbassadors: number;
  activeAmbassadors: number;
  pendingInvites: number;
  totalPledgedAmount: string;
  totalPledgeCount: number;
  totalRewardsAssigned: number;
  totalCommissionOwed: string;
  ambassadors: AmbassadorPledgeSummary[];
}

export function isAmbassadorTier(value: unknown): value is AmbassadorTier {
  return (
    typeof value === "string" &&
    ["SEED", "SPROUT", "BLOOM", "CANOPY"].includes(value)
  );
}
