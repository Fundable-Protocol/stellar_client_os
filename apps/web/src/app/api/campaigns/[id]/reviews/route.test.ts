import { beforeEach, describe, expect, it } from "vitest";
import { backersService } from "@/services/campaign-backers.service";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { resetCampaignReviews } from "@/services/campaign-reviews.service";
import { GET, PATCH, POST } from "./route";

const ID = "testimonial-campaign";
const CREATOR = "GCREATOR";
const BACKER = "GBACKER";
const context = { params: Promise.resolve({ id: ID }) };

function request(method: string, body: unknown) {
  return new Request(`http://localhost/api/campaigns/${ID}/reviews`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/:id/reviews moderation", () => {
  beforeEach(async () => {
    const dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign({ id: ID, creator: CREATOR, name: "Testimonial test", goalAmount: "100" }, dataSource);
    backersService.reset();
    backersService.recordContribution({ campaignId: ID, backerAddress: BACKER, amount: "10", token: "XLM" });
    resetCampaignReviews();
  });

  it("keeps backer submissions private until the creator approves them", async () => {
    expect((await POST(request("POST", { backerAddress: BACKER, rating: 5 }), context)).status).toBe(400);
    const submitted = await POST(request("POST", {
      backerAddress: BACKER,
      rating: 5,
      reviewText: "Great campaign!",
    }), context);
    expect(submitted.status).toBe(201);
    const { review } = await submitted.json();
    expect(review.status).toBe("PENDING");
    expect((await (await GET(new Request(`http://localhost/api/campaigns/${ID}/reviews`), context)).json()).reviews).toHaveLength(0);

    expect((await PATCH(request("PATCH", {
      creatorAddress: "GIMPOSTER",
      reviewId: review.id,
      action: "approve",
    }), context)).status).toBe(403);
    expect((await PATCH(request("PATCH", {
      creatorAddress: CREATOR,
      reviewId: review.id,
      action: "approve",
    }), context)).status).toBe(200);
    const publicReviews = (await (await GET(new Request(`http://localhost/api/campaigns/${ID}/reviews`), context)).json()).reviews;
    expect(publicReviews).toHaveLength(1);

    expect((await PATCH(request("PATCH", {
      creatorAddress: CREATOR,
      reviewId: review.id,
      action: "feature",
    }), context)).status).toBe(200);
    expect((await (await GET(new Request(`http://localhost/api/campaigns/${ID}/reviews`), context)).json()).reviews[0].featured).toBe(true);
  });
});
