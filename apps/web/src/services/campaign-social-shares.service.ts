/**
 * Campaign Social Shares Service (issue #1198)
 *
 * Tracks how many times each campaign has been shared on social platforms.
 * The counts feed the homepage "spotlight" trending algorithm as a virality
 * signal alongside funding velocity, so socially-momentum campaigns surface in
 * the algorithmically-selected spotlight section.
 *
 * Backed by an in-memory store (matching the rest of the demo data layer); swap
 * for a persisted counter (e.g. the `campaign_social_shares` table) in production.
 */

export type SharePlatform =
  | "twitter"
  | "facebook"
  | "linkedin"
  | "whatsapp"
  | "telegram"
  | "email"
  | "copy"
  | "other";

export interface ShareRecord {
  campaignId: string;
  platform: SharePlatform;
  count: number;
}

class CampaignSocialSharesService {
  /** campaignId → per-platform counts */
  private store = new Map<string, Record<SharePlatform, number>>();

  private buckets(campaignId: string): Record<SharePlatform, number> {
    let b = this.store.get(campaignId);
    if (!b) {
      b = {
        twitter: 0,
        facebook: 0,
        linkedin: 0,
        whatsapp: 0,
        telegram: 0,
        email: 0,
        copy: 0,
        other: 0,
      };
      this.store.set(campaignId, b);
    }
    return b;
  }

  /** Record a single share event for a campaign on `platform`. Returns the new total. */
  recordShare(campaignId: string, platform: SharePlatform = "other"): number {
    const buckets = this.buckets(campaignId);
    buckets[platform] += 1;
    return this.getTotal(campaignId);
  }

  /** Total shares across all platforms for a campaign. */
  getTotal(campaignId: string): number {
    const buckets = this.store.get(campaignId);
    if (!buckets) return 0;
    return Object.values(buckets).reduce((sum, n) => sum + n, 0);
  }

  /** Per-platform breakdown for a campaign. */
  getBreakdown(campaignId: string): Record<SharePlatform, number> {
    return { ...this.buckets(campaignId) };
  }

  /** Snapshot of all campaign totals — `{ [campaignId]: total }`. */
  getShareCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, buckets] of this.store.entries()) {
      out[id] = Object.values(buckets).reduce((sum, n) => sum + n, 0);
    }
    return out;
  }
}

export const campaignSocialSharesService = new CampaignSocialSharesService();

/** Normalize an arbitrary platform string into a known {@link SharePlatform}. */
export function normalizeSharePlatform(value: unknown): SharePlatform {
  if (typeof value !== "string") return "other";
  const v = value.toLowerCase();
  if (v === "twitter" || v === "x") return "twitter";
  if (v === "facebook") return "facebook";
  if (v === "linkedin") return "linkedin";
  if (v === "whatsapp") return "whatsapp";
  if (v === "telegram") return "telegram";
  if (v === "email") return "email";
  if (v === "copy" || v === "link") return "copy";
  return "other";
}
