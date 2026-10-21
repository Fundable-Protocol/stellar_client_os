/**
 * Types and interfaces for Reward Tier Instalment Plans
 *
 * Feature Request: Allow backers to pay for high-value reward tiers in
 * monthly instalments rather than a single upfront payment.
 *
 * Acceptance Criteria:
 * 1. Creator enables instalment option per reward tier
 * 2. Backers choose 2, 3, or 6 month plans at checkout
 * 3. First instalment charged at campaign close; subsequent on monthly schedule
 */

/** Supported instalment plan month durations. */
export type InstalmentPlanMonths = 2 | 3 | 6;

export const SUPPORTED_INSTALMENT_MONTHS: readonly InstalmentPlanMonths[] = [2, 3, 6] as const;

/** Status of an individual instalment payment in the schedule. */
export type InstalmentPaymentStatus = "PENDING" | "CHARGED" | "FAILED" | "CANCELLED";

/** Single monthly scheduled payment. */
export interface ScheduledInstalmentPayment {
  instalmentNumber: number; // 1-indexed (1, 2, ... up to totalMonths)
  amount: string; // Token decimal amount string
  dueDate: number; // Unix timestamp (ms)
  status: InstalmentPaymentStatus;
  chargedAt?: number;
  txHash?: string;
  failureReason?: string;
}

/** Status of the backer's overall instalment pledge. */
export type BackerInstalmentPledgeStatus = "ACTIVE" | "COMPLETED" | "DEFAULTED" | "CANCELLED";

/** Reward tier configured with optional instalment options by the creator. */
export interface RewardTier {
  id: string;
  campaignId: string;
  name: string;
  description?: string;
  amount: string; // Total tier price in token decimal units
  token: string;
  /** Creator enables instalment option per reward tier (Acceptance Criterion 1). */
  instalmentEnabled: boolean;
  /** Optional custom subset of allowed plans; defaults to [2, 3, 6] if enabled. */
  allowedPlanMonths?: InstalmentPlanMonths[];
  perks?: string[];
  limit?: number;
  claimed?: number;
  /** Stellar-native NFT reward configuration (Asset & Airdrop on close) */
  nftReward?: {
    enabled: boolean;
    assetUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    maxSupply?: number;
    symbol?: string;
  };
  createdAt: number;
  updatedAt: number;
}

/** Input when creator creates or configures a reward tier. */
export interface ConfigureRewardTierInput {
  id?: string;
  campaignId: string;
  name: string;
  description?: string;
  amount: string;
  token?: string;
  instalmentEnabled: boolean;
  allowedPlanMonths?: InstalmentPlanMonths[];
  perks?: string[];
  limit?: number;
  nftReward?: {
    enabled: boolean;
    assetUrl: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    maxSupply?: number;
    symbol?: string;
  };
}

/**
 * Breakdown of an instalment plan for display at checkout.
 */
export interface InstalmentPlanBreakdown {
  totalAmount: string;
  months: InstalmentPlanMonths;
  monthlyAmount: string;
  /** The first instalment is charged at campaign close (deadline). */
  firstPaymentDate: number;
  /** Full schedule of all instalment payments. */
  schedule: Array<{
    instalmentNumber: number;
    amount: string;
    dueDate: number;
  }>;
}

/**
 * Backer checkout input when pledging via instalment plan.
 */
export interface CheckoutInstalmentPledgeInput {
  campaignId: string;
  tierId: string;
  backerAddress: string;
  backerEmail?: string;
  planMonths: InstalmentPlanMonths; // 2, 3, or 6
  customCampaignCloseDate?: number; // Optional override; defaults to campaign deadline or now + 30 days
  idempotencyKey?: string;
}

/**
 * Backer's confirmed instalment pledge record.
 */
export interface BackerInstalmentPledge {
  id: string;
  campaignId: string;
  tierId: string;
  tierName: string;
  backerAddress: string;
  backerEmail?: string;
  token: string;
  totalAmount: string;
  planMonths: InstalmentPlanMonths;
  monthlyAmount: string;
  campaignCloseDate: number;
  status: BackerInstalmentPledgeStatus;
  schedule: ScheduledInstalmentPayment[];
  createdAt: number;
  updatedAt: number;
  idempotencyKey?: string;
}

/**
 * Verification & helper utilities
 */
export function isSupportedPlanMonths(value: unknown): value is InstalmentPlanMonths {
  return value === 2 || value === 3 || value === 6;
}

/**
 * Calculate the monthly payment breakdown and schedule given the total amount and campaign close date.
 * First instalment is charged at campaign close date; subsequent instalments every 30 days.
 */
export function calculateInstalmentSchedule(
  totalAmountStr: string,
  months: InstalmentPlanMonths,
  campaignCloseDate: number,
): { monthlyAmount: string; schedule: Array<{ instalmentNumber: number; amount: string; dueDate: number }> } {
  const total = parseFloat(totalAmountStr);
  if (isNaN(total) || total <= 0) {
    throw new Error("Invalid total amount for instalment calculation.");
  }

  // Calculate base monthly amount rounded to 2 decimals
  const rawMonthly = total / months;
  const roundedMonthly = Math.floor(rawMonthly * 100) / 100;
  const remainder = Math.round((total - roundedMonthly * months) * 100) / 100;

  const MS_PER_MONTH = 30 * 24 * 60 * 60 * 1000; // 30-day billing cycle

  const schedule: Array<{ instalmentNumber: number; amount: string; dueDate: number }> = [];

  for (let i = 1; i <= months; i++) {
    // Distribute remainder on the first instalment so total adds up exactly
    const amount = i === 1 ? (roundedMonthly + remainder).toFixed(2) : roundedMonthly.toFixed(2);
    const dueDate = campaignCloseDate + (i - 1) * MS_PER_MONTH;
    schedule.push({
      instalmentNumber: i,
      amount,
      dueDate,
    });
  }

  return {
    monthlyAmount: roundedMonthly.toFixed(2),
    schedule,
  };
}
