export const runtime = "nodejs";

import {
  getReviewEligibility,
  getRatingSummary,
  listReviews,
  listReviewsForCreator,
  moderateCampaignReview,
  submitCampaignReview,
  type CampaignReview,
  type RatingSummary,
  type ReviewEligibility,
} from "@/services/campaign-reviews.service";
import { getCampaign } from "@/services/campaign.service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  const viewer = url.searchParams.get("viewer");
  const creator = url.searchParams.get("creator");
  const campaign = creator ? await getCampaign(id) : null;
  const isCreator = Boolean(campaign && creator?.trim().toLowerCase() === campaign.creator.trim().toLowerCase());
  const summary: RatingSummary = getRatingSummary(id);
  const reviews: CampaignReview[] = isCreator ? listReviewsForCreator(id) : listReviews(id);
  let eligibility: ReviewEligibility | null = null;
  if (viewer) {
    eligibility = await getReviewEligibility(id, viewer);
  }
  return Response.json({ reviews, summary, eligibility }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const campaign = await getCampaign(id);
  if (!campaign) return Response.json({ error: "Campaign not found" }, { status: 404 });

  try {
    const body = (await request.json()) as { creatorAddress?: string; reviewId?: string; action?: string };
    if (!body.creatorAddress || body.creatorAddress.trim().toLowerCase() !== campaign.creator.trim().toLowerCase()) {
      return Response.json({ error: "Only the campaign creator can moderate testimonials" }, { status: 403 });
    }
    const actions = ["approve", "reject", "feature", "unfeature"] as const;
    if (!body.reviewId || !actions.some((action) => action === body.action)) {
      return Response.json({ error: "reviewId and a valid action are required" }, { status: 400 });
    }
    const review = moderateCampaignReview(id, body.reviewId, body.action as (typeof actions)[number]);
    if (!review) return Response.json({ error: "Review not found or cannot be featured before approval" }, { status: 404 });
    return Response.json({ review });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = (await request.json()) as { backerAddress?: string; rating?: number; reviewText?: string };
    if (!body.backerAddress || !body.rating) {
      return Response.json({ error: "backerAddress and rating are required" }, { status: 400 });
    }
    const result = await submitCampaignReview({
      campaignId: id,
      backerAddress: body.backerAddress,
      rating: body.rating,
      reviewText: body.reviewText,
    });
    if (!result.ok) {
      const status = result.reason === "campaign_not_found"
        ? 404
        : result.reason === "not_a_backer" || result.reason === "already_reviewed"
          ? 403
          : 400;
      return Response.json({ error: result.error, reason: result.reason }, { status });
    }
    return Response.json({ review: result.review, summary: result.summary }, { status: 201 });
  } catch {
    return Response.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
}
