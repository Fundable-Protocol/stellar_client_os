/**
 * One-time charitable campaign donation models (issue #1001).
 *
 * A donation is a flexible contribution that is deliberately *not* tied to
 * specific trees: the whole amount is placed at the campaign creator's
 * discretion so it can be spent on project costs. Donations reuse the campaign
 * contribution ledger so a campaign's raised total and funding milestones stay
 * in sync with every other kind of contribution.
 */

export type DonationToken = "XLM" | "USDC";

/** A donation is only ever created once the ledger entry has been written. */
export type DonationStatus = "CONFIRMED" | "FAILED";

/** How a donation's funds are allocated by the campaign. */
export type DonationAllocation = "CREATOR_DISCRETION";

export const DONATION_ALLOCATION: DonationAllocation = "CREATOR_DISCRETION";

export const DONATION_ALLOCATION_LABEL = "Creator's discretion";

export const DONATION_ALLOCATION_DESCRIPTION =
  "The full amount is released to the campaign creator to cover project costs. No tree is assigned to this donation.";

export const DONATION_TOKENS: readonly DonationToken[] = ["XLM", "USDC"];

/** Smallest one-time donation accepted (in whole tokens). */
export const MIN_DONATION_AMOUNT = "1";

/** Largest one-time donation accepted — guards against fat-finger entries. */
export const MAX_DONATION_AMOUNT = "1000000";

/** Longest optional donor message. */
export const MAX_DONATION_MESSAGE_LENGTH = 280;

/** Quick-pick amounts shown in the donation UI. */
export const DONATION_PRESET_AMOUNTS: readonly string[] = ["10", "25", "50", "100", "250"];

export interface CampaignDonation {
  id: string;
  campaignId: string;
  donorAddress: string;
  /** Normalised decimal amount, e.g. "25.5". */
  amount: string;
  token: DonationToken;
  allocation: DonationAllocation;
  message?: string;
  anonymous: boolean;
  status: DonationStatus;
  txHash?: string;
  /** Optional caller-supplied key used to make retries idempotent. */
  idempotencyKey?: string;
  createdAt: number;
  confirmedAt: number;
}

export interface DonationReceipt {
  receiptId: string;
  /** Human-readable reference shown to the donor, e.g. "DON-camp-101-A1B2C3". */
  reference: string;
  donationId: string;
  campaignId: string;
  campaignName: string;
  donorAddress: string;
  amount: string;
  token: DonationToken;
  allocation: DonationAllocation;
  allocationLabel: string;
  allocationDescription: string;
  status: DonationStatus;
  issuedAt: number;
}

export interface DonationSummary {
  campaignId: string;
  donationCount: number;
  /** Exact totals per token so XLM and USDC are never summed together. */
  totalsByToken: Record<DonationToken, string>;
  latestDonationAt?: number;
}

export function isDonationToken(value: unknown): value is DonationToken {
  return value === "XLM" || value === "USDC";
}

export function isDonationStatus(value: unknown): value is DonationStatus {
  return value === "CONFIRMED" || value === "FAILED";
}

const WHOLE_AMOUNT_PATTERN = /^\d+$/;

/**
 * Normalise a user-entered donation amount, or return `null` when it cannot be
 * parsed. Amounts are whole tokens so a donation maps 1:1 onto the campaign
 * contribution ledger (which stores whole display units).
 */
export function normalizeDonationAmount(value: string | number): string | null {
  const text = String(value ?? "").trim();
  if (!WHOLE_AMOUNT_PATTERN.test(text)) return null;
  return BigInt(text).toString();
}

/**
 * Validate a donation amount against the configured bounds.
 * Returns an error message, or `null` when the amount is acceptable.
 */
export function validateDonationAmount(amount: string | number): string | null {
  const normalized = normalizeDonationAmount(amount);
  if (normalized === null) return "Enter a whole-number donation amount.";

  const value = BigInt(normalized);
  if (value <= 0n) return "Enter a donation amount greater than zero.";
  if (value < BigInt(MIN_DONATION_AMOUNT)) {
    return `The minimum donation is ${MIN_DONATION_AMOUNT} tokens.`;
  }
  if (value > BigInt(MAX_DONATION_AMOUNT)) {
    return `The maximum donation is ${MAX_DONATION_AMOUNT} tokens.`;
  }
  return null;
}

/** Shorten a Stellar address for display: "GABC…WXYZ". */
export function maskDonorAddress(address: string): string {
  const trimmed = (address ?? "").trim();
  if (trimmed.length <= 10) return trimmed;
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`;
}

/** Deterministic receipt reference for a donation. */
export function donationReceiptReference(campaignId: string, donationId: string): string {
  const campaignPart = (campaignId ?? "").trim() || "campaign";
  const suffix = (donationId ?? "").replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase() || "000000";
  return `DON-${campaignPart}-${suffix}`;
}
