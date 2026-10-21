import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST, PATCH, DELETE } from "./route";
import {
  connectSocialAccount,
  resetSocialSchedulerStore,
} from "@/services/campaign-social-scheduler.service";

const CREATOR = "GD6W...X892";
const CAMPAIGN_ID = "camp-101";

describe("/api/campaigns/[id]/social-posts route (Issue #1266)", () => {
  beforeEach(() => {
    resetSocialSchedulerStore();
  });

  it("rejects scheduling when target platform is not connected", async () => {
    const req = new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/social-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignTitle: "Save the Amazon RainForest Reserve",
        creatorAddress: CREATOR,
        platforms: ["twitter"],
        content: "Support our reforestation drive!",
        scheduledFor: "2099-11-10T14:00:00.000Z",
      }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Twitter / X");
  });

  it("schedules, lists, reschedules, and cancels a campaign promotional post", async () => {
    connectSocialAccount(CREATOR, { platform: "twitter", handle: "@amazon_reserve" });
    connectSocialAccount(CREATOR, { platform: "facebook", handle: "fb.com/amazon" });

    const postReq = new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/social-posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignTitle: "Save the Amazon RainForest Reserve",
        creatorAddress: CREATOR,
        platforms: ["twitter", "facebook"],
        content: "1,500 trees planted so far!",
        hashtags: ["Amazon", "Stellar"],
        scheduledFor: "2099-11-12T15:00:00.000Z",
      }),
    });

    const postRes = await POST(postReq, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(postRes.status).toBe(201);
    const { post } = await postRes.json();
    expect(post.campaignId).toBe(CAMPAIGN_ID);
    expect(post.platforms).toEqual(["twitter", "facebook"]);

    const getReq = new Request(
      `http://localhost/api/campaigns/${CAMPAIGN_ID}/social-posts?month=2099-11`,
    );
    const getRes = await GET(getReq, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(getRes.status).toBe(200);
    const { posts } = await getRes.json();
    expect(posts).toHaveLength(1);

    const patchReq = new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/social-posts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        postId: post.id,
        scheduledFor: "2099-11-18T16:00:00.000Z",
      }),
    });
    const patchRes = await PATCH(patchReq);
    expect(patchRes.status).toBe(200);
    const patched = await patchRes.json();
    expect(patched.post.dateKey).toBe("2099-11-18");

    const delReq = new Request(
      `http://localhost/api/campaigns/${CAMPAIGN_ID}/social-posts?postId=${encodeURIComponent(post.id)}`,
      { method: "DELETE" },
    );
    const delRes = await DELETE(delReq);
    expect(delRes.status).toBe(200);
    const deleted = await delRes.json();
    expect(deleted.post.status).toBe("cancelled");
  });
});
