/**
 * Types for early-bird discount reward tiers (Issue #1342).
 *
 * Early-bird tiers extend standard reward perks with optional:
 *  - expiresAt  — ISO-8601 timestamp at which the tier closes automatically.
 *  - inventoryCap — maximum number of backers that may claim this tier.
 *
 * Once either condition is met the tier transitions to `status: 'expired'`
 * and backers fall back to the linked `fallbackTierId` (standard tier).
 */

export type EarlyBirdStatus = 'active' | 'expired' | 'sold_out';

export interface EarlyBirdTier {
  /** Unique identifier for this early-bird tier. */
  id: string;
  campaignId: string;

  /** Display title shown on the reward card. */
  title: string;
  description: string;

  /**
   * Optional ISO-8601 expiry timestamp.
   * Once `Date.now() >= expiresAt` the tier is treated as expired.
   */
  expiresAt: string | null;

  /**
   * Optional hard cap on the number of backers allowed.
   * When `claimedCount >= inventoryCap` the tier is considered sold_out.
   */
  inventoryCap: number | null;

  /** Number of backers who have already claimed this tier. */
  claimedCount: number;

  /** Discounted pledge amount (e.g. "20 XLM"). */
  pledgeAmount: string;

  /**
   * Standard tier ID to present to backers once this early-bird tier
   * is no longer available.
   */
  fallbackTierId: string | null;

  /** Computed status - determined at read time, not persisted. */
  status: EarlyBirdStatus;

  createdAt: string;
  updatedAt: string;
}

export interface CreateEarlyBirdTierInput {
  title: string;
  description: string;
  pledgeAmount: string;
  expiresAt?: string | null;
  inventoryCap?: number | null;
  fallbackTierId?: string | null;
}

export interface UpdateEarlyBirdTierInput {
  title?: string;
  description?: string;
  pledgeAmount?: string;
  expiresAt?: string | null;
  inventoryCap?: number | null;
  fallbackTierId?: string | null;
}

/** Shape returned to the client so the UI can drive a live countdown. */
export interface EarlyBirdCountdownInfo {
  tierId: string;
  status: EarlyBirdStatus;
  /** Milliseconds remaining until expiry, or null if no time limit. */
  msRemaining: number | null;
  /** Slots remaining until inventory cap, or null if no inventory cap. */
  slotsRemaining: number | null;
}
