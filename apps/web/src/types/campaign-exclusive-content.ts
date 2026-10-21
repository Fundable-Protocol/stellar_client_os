/**
 * Types for the per-campaign backer-only exclusive content area (#1267).
 *
 * Campaign creators can publish rich-text posts and upload exclusive files
 * that are gated by on-chain/recorded pledge status:
 *  - Verified backers (and the campaign creator) receive full rich-text bodies
 *    and downloadable file URLs.
 *  - Non-backers receive a redacted payload with a teaser string so the UI
 *    can render a blurred teaser card and a pledge CTA without leaking gated
 *    content over the wire.
 */

export type ExclusiveContentPostType = "RICH_TEXT" | "FILE";

export interface ExclusiveContentAttachmentInput {
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  downloadUrl: string;
}

export interface ExclusiveContentAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  /** Present for verified backers and the creator; null when gated. */
  downloadUrl: string | null;
}

export interface ExclusiveContentPost {
  id: string;
  campaignId: string;
  creatorAddress: string;
  title: string;
  /** Short preview text rendered inside the blurred teaser for non-backers. */
  teaser: string;
  postType: ExclusiveContentPostType;
  /** Full rich-text body for verified backers/creator; null when gated. */
  richTextContent: string | null;
  attachments: ExclusiveContentAttachment[];
  /** Optional minimum pledge amount in campaign token units required to unlock. */
  minPledgeAmount?: string;
  createdAt: number;
  updatedAt: number;
  /** True when the current viewer has not met the pledge gate for this post. */
  locked: boolean;
}

export type PledgeGateReason =
  | "verified_backer"
  | "creator"
  | "no_wallet"
  | "no_pledge"
  | "insufficient_pledge";

export interface PledgeGateStatus {
  hasAccess: boolean;
  isVerifiedBacker: boolean;
  isCreator: boolean;
  viewerAddress?: string;
  pledgedAmount: string;
  token: string;
  contributionCount: number;
  reason: PledgeGateReason;
}

export interface CreateExclusiveContentInput {
  campaignId: string;
  creatorAddress: string;
  title: string;
  teaser?: string;
  postType?: ExclusiveContentPostType;
  richTextContent?: string;
  attachments?: ExclusiveContentAttachmentInput[];
  minPledgeAmount?: string;
}

export interface GetExclusiveContentOptions {
  viewerAddress?: string;
  creatorAddress?: string;
}

export interface ExclusiveContentFeedResult {
  campaignId: string;
  gateStatus: PledgeGateStatus;
  posts: ExclusiveContentPost[];
  totalPosts: number;
  unlockedCount: number;
  lockedCount: number;
}

export const MAX_EXCLUSIVE_TITLE_LENGTH = 160;
export const MAX_EXCLUSIVE_TEASER_LENGTH = 280;
export const MAX_EXCLUSIVE_RICH_TEXT_LENGTH = 20_000;
export const MAX_EXCLUSIVE_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB

export const EXCLUSIVE_POST_TYPES: readonly ExclusiveContentPostType[] = [
  "RICH_TEXT",
  "FILE",
];

export function isExclusivePostType(value: unknown): value is ExclusiveContentPostType {
  return (
    typeof value === "string" &&
    (EXCLUSIVE_POST_TYPES as readonly string[]).includes(value)
  );
}

/** Format byte counts into human-readable labels (e.g. "2.4 MB", "420 KB"). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

/** Strip markdown/HTML syntax and truncate to build a clean teaser snippet. */
export function deriveTeaserFromRichText(
  content: string,
  maxLength = MAX_EXCLUSIVE_TEASER_LENGTH,
): string {
  const plain = content
    .replace(/<[^>]+>/g, " ")
    .replace(/[#*_`~>\[\]]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Exclusive backer-only update from the campaign creator.";
  if (plain.length <= maxLength) return plain;
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}
