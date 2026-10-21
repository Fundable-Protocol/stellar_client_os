import { backersService } from "./campaign-backers.service";
import { getCampaign, queryCampaigns, type CampaignRecord } from "./campaign.service";

/**
 * Campaign testimonial & star review system (issue #1250).
 *
 * Backers can leave one star rating plus an optional short testimonial per
 * campaign after contributing. Creators approve submissions before publication.
 *
 * Storage is in-memory, matching the repo's service conventions.
 */

export interface CampaignReview {
  id: string;
  campaignId: string;
  backerAddress: string;
  /** Whole stars, 1–5. */
  rating: number;
  /** Short testimonial text, limited to 280 characters. */
  reviewText: string;
  createdAt: number;
  status: "PENDING" | "APPROVED" | "REJECTED";
  featured: boolean;
}

export interface RatingSummary {
  /** Rounded to one decimal; null when there are no reviews. */
  averageRating: number | null;
  reviewCount: number;
}

export interface CreatorOverallRating extends RatingSummary {
  creatorAddress: string;
  campaignCount: number;
}

export type ReviewEligibilityReason =
  | "eligible"
  | "campaign_not_found"
  | "not_a_backer"
  | "already_reviewed";

export interface ReviewEligibility {
  eligible: boolean;
  reason: ReviewEligibilityReason;
}

export type ReviewActionResult =
  | { ok: true; review: CampaignReview; summary: RatingSummary }
  | { ok: false; error: string; reason?: ReviewEligibilityReason };

export const MAX_REVIEW_TEXT_LENGTH = 280;

const reviews = new Map<string, CampaignReview[]>();

function key(campaignId: string): string {
  return campaignId.trim();
}

export function checkReviewEligibility(
  campaignId: string,
  backerAddress: string,
  _now: number = Date.now(),
  campaignLookup: (id: string) => CampaignRecord | null = () => null,
): ReviewEligibility {
  void _now;
  const campaign = campaignLookup(campaignId);
  if (!campaign) return { eligible: false, reason: "campaign_not_found" };

  const isBacker = backersService.getContributions(key(campaignId)).some(
    (entry) => entry.backerAddress.trim().toLowerCase() === backerAddress.trim().toLowerCase(),
  );
  if (!isBacker) return { eligible: false, reason: "not_a_backer" };

  if ((reviews.get(key(campaignId)) ?? []).some((review) => review.backerAddress.trim().toLowerCase() === backerAddress.trim().toLowerCase())) {
    return { eligible: false, reason: "already_reviewed" };
  }

  return { eligible: true, reason: "eligible" };
}

export async function getReviewEligibility(
  campaignId: string,
  backerAddress: string,
  now: number = Date.now(),
  campaignLookup?: (id: string) => CampaignRecord | null,
): Promise<ReviewEligibility> {
  return checkReviewEligibility(
    campaignId,
    backerAddress,
    now,
    campaignLookup ?? await asyncCampaignLookup(campaignId),
  );
}

async function asyncCampaignLookup(campaignId: string): Promise<(id: string) => CampaignRecord | null> {
  const campaign = await getCampaign(key(campaignId));
  return () => campaign;
}

export function listReviews(campaignId: string): CampaignReview[] {
  return (reviews.get(key(campaignId)) ?? [])
    .filter((review) => review.status === "APPROVED")
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.createdAt - a.createdAt);
}

export function listReviewsForCreator(campaignId: string): CampaignReview[] {
  return [...(reviews.get(key(campaignId)) ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}

export function getRatingSummary(campaignId: string): RatingSummary {
  const entries = listReviews(campaignId);
  if (entries.length === 0) return { averageRating: null, reviewCount: 0 };
  const total = entries.reduce((sum, review) => sum + review.rating, 0);
  return { averageRating: Math.round((total / entries.length) * 10) / 10, reviewCount: entries.length };
}

export async function getCreatorOverallRating(creatorAddress: string): Promise<CreatorOverallRating> {
  const campaigns = await queryCampaigns({ filter: { creator: creatorAddress }, limit: 100 });
  let total = 0;
  let count = 0;
  for (const campaign of campaigns) {
    for (const review of listReviews(campaign.id)) {
      total += review.rating;
      count += 1;
    }
  }
  return {
    creatorAddress,
    averageRating: count > 0 ? Math.round((total / count) * 10) / 10 : null,
    reviewCount: count,
    campaignCount: campaigns.length,
  };
}

export function getCampaignRatingSummaries(campaignIds: string[]): Record<string, RatingSummary> {
  return Object.fromEntries(campaignIds.map((id) => [id, getRatingSummary(id)]));
}

export async function submitCampaignReview(
  input: { campaignId: string; backerAddress: string; rating: number; reviewText?: string },
  now: number = Date.now(),
  campaignLookup?: (id: string) => CampaignRecord | null,
): Promise<ReviewActionResult> {
  const campaignId = key(input.campaignId);
  const backerAddress = input.backerAddress?.trim();
  if (!campaignId || !backerAddress) {
    return { ok: false, error: "campaignId and backerAddress are required" };
  }
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    return { ok: false, error: "rating must be a whole number between 1 and 5" };
  }
  const reviewText = input.reviewText?.trim();
  if (!reviewText) {
    return { ok: false, error: "reviewText is required" };
  }
  if (reviewText.length > MAX_REVIEW_TEXT_LENGTH) {
    return { ok: false, error: `reviewText must be at most ${MAX_REVIEW_TEXT_LENGTH} characters` };
  }

  const eligibility = await getReviewEligibility(campaignId, backerAddress, now, campaignLookup);
  if (!eligibility.eligible) {
    return { ok: false, error: REVIEW_ERRORS[eligibility.reason], reason: eligibility.reason };
  }

  const review: CampaignReview = {
    id: `${campaignId}:review:${backerAddress}:${now}`,
    campaignId,
    backerAddress,
    rating: input.rating,
    reviewText,
    createdAt: now,
    status: "PENDING",
    featured: false,
  };
  reviews.set(campaignId, [...(reviews.get(campaignId) ?? []), review]);
  return { ok: true, review, summary: getRatingSummary(campaignId) };
}

const REVIEW_ERRORS: Record<ReviewEligibilityReason, string> = {
  eligible: "",
  campaign_not_found: "Campaign not found",
  not_a_backer: "Only campaign backers can leave a review",
  already_reviewed: "You have already reviewed this campaign",
};

export function moderateCampaignReview(
  campaignId: string,
  reviewId: string,
  action: "approve" | "reject" | "feature" | "unfeature",
): CampaignReview | null {
  const entries = reviews.get(key(campaignId)) ?? [];
  const review = entries.find((entry) => entry.id === reviewId);
  if (!review) return null;
  if (action === "approve") {
    review.status = "APPROVED";
  } else if (action === "reject") {
    review.status = "REJECTED";
    review.featured = false;
  } else {
    if (review.status !== "APPROVED") return null;
    review.featured = action === "feature";
  }
  return review;
}

/** Test helper: wipe all stored reviews. */
export function resetCampaignReviews(): void {
  reviews.clear();
}
