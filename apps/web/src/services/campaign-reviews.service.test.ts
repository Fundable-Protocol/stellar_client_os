import { beforeEach, describe, expect, it } from "vitest";
import {
  checkReviewEligibility,
  getCampaignRatingSummaries,
  getRatingSummary,
  listReviews,
  moderateCampaignReview,
  resetCampaignReviews,
  submitCampaignReview,
} from "./campaign-reviews.service";
import { backersService } from "./campaign-backers.service";
import type { CampaignRecord } from "./campaign.service";

const CAMPAIGN = "camp-rev-1";
const BACKER = "GBACKER...AAAA";
const OTHER = "GOTHER...BBBB";
const NOW = 1_700_000_000_000;

function campaignRecord(status: CampaignRecord["status"] = "ACTIVE"): CampaignRecord {
  return {
    id: CAMPAIGN,
    creator: "GCREATOR...AAAA",
    name: "Reviewable campaign",
    status,
    goalAmount: "50000",
    raisedAmount: "40000",
    sponsorCount: 1,
    treeCount: 10,
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    statusChangedAt: NOW - 1000,
    sponsors: [],
    statusHistory: [],
  };
}

const campaignLookup = () => campaignRecord();

beforeEach(() => {
  resetCampaignReviews();
  backersService.reset();
  backersService.registerCampaignCreator(CAMPAIGN, "GCREATOR...AAAA");
  backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: BACKER, amount: "900", token: "XLM", displayName: "Alice" });
});

describe("review eligibility", () => {
  it("lets a backer submit immediately after contributing, including during an active campaign", () => {
    expect(checkReviewEligibility(CAMPAIGN, BACKER, NOW, campaignLookup).eligible).toBe(true);
  });

  it("rejects non-backers, unknown campaigns, and repeat reviews", async () => {
    expect(checkReviewEligibility(CAMPAIGN, OTHER, NOW, campaignLookup).reason).toBe("not_a_backer");
    expect(checkReviewEligibility("ghost", BACKER, NOW, () => null).reason).toBe("campaign_not_found");
    await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 5, reviewText: "Great work." }, NOW, campaignLookup);
    expect(checkReviewEligibility(CAMPAIGN, BACKER, NOW + 1, campaignLookup).reason).toBe("already_reviewed");
  });
});

describe("submitCampaignReview", () => {
  it("holds submissions for approval and aggregates only approved reviews", async () => {
    const withText = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 4, reviewText: "Great work!" }, NOW, campaignLookup);
    expect(withText.ok).toBe(true);
    expect(getRatingSummary(CAMPAIGN)).toEqual({ averageRating: null, reviewCount: 0 });
    expect(listReviews(CAMPAIGN)).toHaveLength(0);
    if (!withText.ok) throw new Error("Expected review submission to succeed");
    moderateCampaignReview(CAMPAIGN, withText.review.id, "approve");

    backersService.recordContribution({ campaignId: CAMPAIGN, backerAddress: OTHER, amount: "100", token: "XLM", displayName: "Bob" });
    const withTestimonial = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: OTHER, rating: 5, reviewText: "Meaningful impact." }, NOW + 1, campaignLookup);
    expect(withTestimonial.ok).toBe(true);
    if (!withTestimonial.ok) throw new Error("Expected review submission to succeed");
    moderateCampaignReview(CAMPAIGN, withTestimonial.review.id, "approve");

    const summary = getRatingSummary(CAMPAIGN);
    expect(summary).toEqual({ averageRating: 4.5, reviewCount: 2 });
    expect(listReviews(CAMPAIGN)).toHaveLength(2);
    expect(getCampaignRatingSummaries([CAMPAIGN])[CAMPAIGN]).toEqual(summary);
  });

  it("rejects out-of-range ratings, oversized text, and ineligible submissions", async () => {
    const badRating = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 6 }, NOW, campaignLookup);
    expect(badRating.ok).toBe(false);
    const missingText = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 5 }, NOW, campaignLookup);
    expect(missingText).toMatchObject({ ok: false, error: "reviewText is required" });

    const tooLong = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 5, reviewText: "x".repeat(281) }, NOW, campaignLookup);
    expect(tooLong.ok).toBe(false);

    const rejected = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: OTHER, rating: 5, reviewText: "Great work." }, NOW, campaignLookup);
    expect(rejected).toMatchObject({ ok: false, reason: "not_a_backer" });
    expect(listReviews(CAMPAIGN)).toHaveLength(0);
  });

  it("only lets approved testimonials be featured", async () => {
    const result = await submitCampaignReview({ campaignId: CAMPAIGN, backerAddress: BACKER, rating: 5, reviewText: "Great work." }, NOW, campaignLookup);
    if (!result.ok) throw new Error("Expected review submission to succeed");
    expect(moderateCampaignReview(CAMPAIGN, result.review.id, "feature")).toBeNull();
    moderateCampaignReview(CAMPAIGN, result.review.id, "approve");
    expect(moderateCampaignReview(CAMPAIGN, result.review.id, "feature")?.featured).toBe(true);
  });
});
