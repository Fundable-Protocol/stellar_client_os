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

/**
 * Currencies a backer may pledge in (issue #1170). Fiat currencies are
 * converted to a settlement token at pledge time.
 */
export type SupportedCurrency = "USD" | "EUR" | "XLM" | "USDC";

export const SUPPORTED_CURRENCIES: readonly SupportedCurrency[] = ["USD", "EUR", "XLM", "USDC"];

/** Currencies that are settled on-chain without conversion. */
export const SETTLEMENT_CURRENCIES: readonly SupportedCurrency[] = ["XLM", "USDC"];

/** Where a conversion rate came from, for auditability. */
export type ConversionRateSource = "ORACLE" | "EXCHANGE" | "FIXED";

/**
 * A point-in-time conversion quote between two currencies. `rate` is the
 * multiplier applied to the original amount to obtain the converted amount.
 */
export interface ConversionQuote {
  fromCurrency: SupportedCurrency;
  toCurrency: SupportedCurrency;
  /** Decimal rate, e.g. "0.11" for 1 USD -> 0.11 XLM. */
  rate: string;
  /** Unix epoch milliseconds when the rate was captured. */
  quotedAt: number;
  source: ConversionRateSource;
}

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
  /** Currency the backer pledged in. Defaults to `token` for legacy records. */
  originalCurrency?: SupportedCurrency;
  /** Amount in `originalCurrency` before conversion. */
  originalAmount?: string;
  /** Currency the donation was settled in (always a settlement currency). */
  convertedCurrency?: SupportedCurrency;
  /** Amount in `convertedCurrency` after conversion. */
  convertedAmount?: string;
  /** Rate applied to convert `originalAmount` into `convertedAmount`. */
  conversionRate?: string;
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
  /** Currency the backer pledged in. Defaults to `token` for legacy receipts. */
  originalCurrency?: SupportedCurrency;
  /** Amount in `originalCurrency` before conversion. */
  originalAmount?: string;
  /** Currency the donation was settled in. */
  convertedCurrency?: SupportedCurrency;
  /** Amount in `convertedCurrency` after conversion. */
  convertedAmount?: string;
  /** Rate applied to convert `originalAmount` into `convertedAmount`. */
  conversionRate?: string;
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

export function isSupportedCurrency(value: unknown): value is SupportedCurrency {
  return (
    value === "USD" || value === "EUR" || value === "XLM" || value === "USDC"
  );
}

export function isSettlementCurrency(value: unknown): value is SupportedCurrency {
  return value === "XLM" || value === "USDC";
}

/** True when pledging in `currency` requires a conversion to settle. */
export function requiresConversion(currency: SupportedCurrency): boolean {
  return !isSettlementCurrency(currency);
}

/**
 * Format the dual-amount line shown on a receipt, e.g.
 * "25.00 USD (≈ 227.27 XLM)". Falls back to the single amount when no
 * conversion details are present (legacy receipts).
 */
export function formatDualAmount(receipt: {
  amount: string;
  token: DonationToken;
  originalCurrency?: SupportedCurrency;
  originalAmount?: string;
  convertedCurrency?: SupportedCurrency;
  convertedAmount?: string;
}): string {
  const originalCurrency = receipt.originalCurrency ?? receipt.token;
  const originalAmount = receipt.originalAmount ?? receipt.amount;
  const convertedCurrency = receipt.convertedCurrency;
  const convertedAmount = receipt.convertedAmount;

  if (!convertedCurrency || !convertedAmount) {
    return `${originalAmount} ${originalCurrency}`;
  }
  if (originalCurrency === convertedCurrency && originalAmount === convertedAmount) {
    return `${originalAmount} ${originalCurrency}`;
  }
  return `${originalAmount} ${originalCurrency} (≈ ${convertedAmount} ${convertedCurrency})`;
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
