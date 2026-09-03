/**
 * Types for the per-campaign top backers leaderboard.
 *
 * The campaign detail page shows the top backers ranked by the total amount
 * they contributed. Campaign creators can additionally feature (pin/highlight)
 * a small number of backers, and every backer controls their own privacy:
 *
 *  - PUBLIC     -> name, address and amount are shown on the leaderboard
 *  - ANONYMOUS  -> still ranked, but name/address (and optionally amount) are
 *                  redacted so the contribution cannot be attributed
 *  - PRIVATE    -> excluded from the leaderboard entirely (only counted in the
 *                  aggregate totals)
 *
 * Privacy always wins: a backer who is not PUBLIC can never be featured, and
 * switching away from PUBLIC removes any existing feature automatically.
 */

export type BackerVisibility = "PUBLIC" | "ANONYMOUS" | "PRIVATE";

/** A single on-chain contribution from a backer to a campaign. */
export interface BackerContribution {
  id: string;
  campaignId: string;
  /** Stellar address (G...) of the backer. */
  backerAddress: string;
  /** Decimal amount in token units, e.g. "1500" or "250.5". */
  amount: string;
  /** Token symbol, e.g. "XLM" or "USDC". */
  token: string;
  contributedAt: number; // Unix timestamp ms
  txHash?: string;
  /** Optional profile supplied by the backer at contribution time. */
  displayName?: string;
  avatarUrl?: string;
  /** Optional public message shown next to the contribution. */
  message?: string;
}

/** Per-campaign privacy preference for one backer. */
export interface BackerPrivacyPreference {
  campaignId: string;
  backerAddress: string;
  visibility: BackerVisibility;
  /** Whether the amount may be shown when the backer is ANONYMOUS. */
  showAmount: boolean;
  /** Whether the campaign creator may feature/highlight this backer. */
  allowFeaturing: boolean;
  updatedAt: number; // Unix timestamp ms
}

/** A backer the campaign creator pinned to the top of the leaderboard. */
export interface FeaturedBacker {
  campaignId: string;
  backerAddress: string;
  /** Address of the campaign creator that featured this backer. */
  featuredBy: string;
  featuredAt: number; // Unix timestamp ms
  /** Optional creator shout-out shown on the leaderboard row. */
  note?: string;
}

/** One row of the (already privacy-redacted) public leaderboard. */
export interface TopBackerEntry {
  /** Rank by total contributed amount, 1-based. */
  rank: number;
  /** Redacted ("Hidden address") unless the viewer may see it. */
  backerAddress: string;
  /** "Anonymous backer" for anonymous rows the viewer may not resolve. */
  displayName: string;
  avatarUrl?: string;
  /** Formatted total amount, or null when the amount is hidden. */
  totalAmount: string | null;
  amountVisible: boolean;
  token: string;
  contributionCount: number;
  firstContributedAt: number;
  lastContributedAt: number;
  /** Effective visibility after redaction rules were applied. */
  visibility: BackerVisibility;
  isFeatured: boolean;
  featuredAt?: number;
  featureNote?: string;
  /** True when the viewer is this backer (lets the UI offer "You"). */
  isSelf: boolean;
  /** Latest public message, only present for fully public rows. */
  message?: string;
}

export interface TopBackersResult {
  campaignId: string;
  /** Ranked, redacted rows — at most `limit` entries. */
  backers: TopBackerEntry[];
  limit: number;
  /** Every backer that contributed, including private ones. */
  totalBackers: number;
  /** Backers excluded from the board because they chose PRIVATE. */
  privateBackers: number;
  /** Aggregate amount across every contribution (private ones included). */
  totalAmount: string;
  /** How many of the ranked rows are creator-featured. */
  featuredCount: number;
  updatedAt: number;
}

export interface RecordContributionInput {
  campaignId: string;
  backerAddress: string;
  amount: string;
  token?: string;
  contributedAt?: number;
  txHash?: string;
  displayName?: string;
  avatarUrl?: string;
  message?: string;
}

export interface SetPrivacyInput {
  campaignId: string;
  backerAddress: string;
  visibility?: BackerVisibility;
  showAmount?: boolean;
  allowFeaturing?: boolean;
}

export interface FeatureBackerInput {
  campaignId: string;
  backerAddress: string;
  /** Address performing the action — must be the campaign creator. */
  featuredBy: string;
  /** Optional creator override (defaults to the registered creator). */
  campaignCreator?: string;
  note?: string;
}

export interface GetTopBackersOptions {
  limit?: number;
  /** Address of the person reading the leaderboard. */
  viewerAddress?: string;
  /** Campaign creator address; a creator sees their backers unredacted. */
  creatorAddress?: string;
  /** Force-show private rows (creator/admin views). Defaults to creator only. */
  includePrivate?: boolean;
}

/** How many backers the campaign detail page shows. */
export const TOP_BACKERS_LIMIT = 10;

/** Creators may only pin a handful of backers. */
export const MAX_FEATURED_BACKERS = 3;

export const ANONYMOUS_BACKER_LABEL = "Anonymous backer";
export const HIDDEN_ADDRESS_LABEL = "Hidden address";
export const HIDDEN_AMOUNT_LABEL = "Amount hidden";

export const BACKER_VISIBILITIES: readonly BackerVisibility[] = [
  "PUBLIC",
  "ANONYMOUS",
  "PRIVATE",
];

export function isBackerVisibility(value: unknown): value is BackerVisibility {
  return typeof value === "string" && (BACKER_VISIBILITIES as readonly string[]).includes(value);
}

export function defaultBackerPrivacy(
  campaignId: string,
  backerAddress: string,
  updatedAt = Date.now(),
): BackerPrivacyPreference {
  return {
    campaignId,
    backerAddress,
    visibility: "PUBLIC",
    showAmount: true,
    allowFeaturing: true,
    updatedAt,
  };
}

/** A backer may be featured only when fully public and they allow it. */
export function canBeFeatured(preference: Pick<BackerPrivacyPreference, "visibility" | "allowFeaturing">): boolean {
  return preference.visibility === "PUBLIC" && preference.allowFeaturing !== false;
}

const AMOUNT_SCALE = 10_000_000n; // 7 decimals — Stellar stroops
const AMOUNT_DECIMALS = 7;
const AMOUNT_PATTERN = /^-?(\d+)(?:\.(\d+))?$/;

/**
 * Parse a decimal token amount into a fixed-point bigint (7 decimals).
 * Returns null for anything that is not a plain decimal number so callers can
 * skip malformed data instead of producing NaN totals.
 */
export function parseTokenAmount(value: string | number | bigint | null | undefined): bigint | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value * AMOUNT_SCALE;
  const text = String(value).trim();
  const match = AMOUNT_PATTERN.exec(text);
  if (!match) return null;
  const negative = text.startsWith("-");
  const whole = BigInt(match[1] ?? "0");
  const fraction = (match[2] ?? "").padEnd(AMOUNT_DECIMALS, "0").slice(0, AMOUNT_DECIMALS);
  const scaled = whole * AMOUNT_SCALE + BigInt(fraction);
  return negative ? -scaled : scaled;
}

/** Inverse of {@link parseTokenAmount} — trailing zeros are trimmed. */
export function formatTokenAmount(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const whole = (abs / AMOUNT_SCALE).toString();
  const fraction = (abs % AMOUNT_SCALE).toString().padStart(AMOUNT_DECIMALS, "0").replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

/** Sum decimal token amounts exactly, ignoring malformed/negative entries. */
export function sumTokenAmounts(values: Array<string | number | bigint | null | undefined>): string {
  let total = 0n;
  for (const value of values) {
    const parsed = parseTokenAmount(value);
    if (parsed !== null && parsed > 0n) total += parsed;
  }
  return formatTokenAmount(total);
}

/** Compact "12,345" grouping used by the leaderboard UI. */
export function formatBackerAmount(amount: string | null): string {
  if (amount === null) return HIDDEN_AMOUNT_LABEL;
  const [whole, fraction] = amount.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/** Initials fallback for backer rows without an avatar. */
export function backerInitials(displayName: string, address: string): string {
  const trimmed = (displayName || "").trim();
  if (trimmed) {
    const parts = trimmed.split(/\s+/).slice(0, 2);
    return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || trimmed.slice(0, 2).toUpperCase();
  }
  return (address || "?").replace(/[^A-Za-z0-9]/g, "").slice(0, 2).toUpperCase() || "??";
}
