/**
 * Backer Anonymity Types — Issue #1195
 *
 * Allow backers to choose to pledge anonymously, hiding their name and amount
 * from the public backer list while still receiving rewards and receipts.
 */

/** The anonymity preference a backer sets at pledge time. */
export type PledgeAnonymityMode = "PUBLIC" | "ANONYMOUS";

/** Anonymity metadata attached to any pledge or donation submission. */
export interface PledgeAnonymityOptions {
  /** Whether the backer wants to be hidden from the public backer list. */
  anonymous: boolean;
  /**
   * When true, both name and total amount are hidden from public views.
   * The backer still receives their reward, receipt, and all notifications.
   */
  hideAmount: boolean;
}

export const DEFAULT_ANONYMITY_OPTIONS: PledgeAnonymityOptions = {
  anonymous: false,
  hideAmount: false,
};

/** Human-readable label used when a backer's identity is hidden. */
export const ANONYMOUS_PLEDGE_LABEL = "Anonymous Backer";

/** Tooltip copy shown next to the anonymity checkbox. */
export const ANONYMITY_TOOLTIP =
  "Your name and wallet address will not appear on the public backer list. " +
  "You will still receive your reward, receipt, and all campaign updates.";
