import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { resetAmbassadorStores } from "@/services/campaign-ambassador.service";

const CAMPAIGN_ID = "camp-101";
const CREATOR = "GD6W...X892";

function postRequest(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/ambassadors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/[id]/ambassadors route", () => {
  beforeEach(() => {
    resetAmbassadorStores();
  });

  it("invites an ambassador by email and returns the invite link", async () => {
    const res = await POST(
      postRequest({
        creatorAddress: CREATOR,
        email: "ambassador@example.com",
        name: "Alex Rivera",
        tier: "SPROUT",
        campaignTitle: "Save the Amazon RainForest Reserve",
      }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.invite.email).toBe("ambassador@example.com");
    expect(body.invite.tier).toBe("SPROUT");
    expect(body.inviteLink).toContain(`/campaigns/invite/ambassador/${body.invite.token}`);
  });

  it("rejects an invitation without a valid email", async () => {
    const res = await POST(
      postRequest({ creatorAddress: CREATOR, email: "nope" }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("email");
  });

  it("rejects an unknown tier", async () => {
    const res = await POST(
      postRequest({ creatorAddress: CREATOR, email: "a@example.com", tier: "MOUNTAIN" }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("tier");
  });

  it("requires a creator address", async () => {
    const res = await POST(postRequest({ email: "a@example.com" }), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the program dashboard", async () => {
    await POST(
      postRequest({ creatorAddress: CREATOR, email: "ambassador@example.com" }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    const res = await GET(
      new Request(
        `http://localhost/api/campaigns/${CAMPAIGN_ID}/ambassadors?viewerAddress=${CREATOR}`,
      ),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.totalAmbassadors).toBe(0);
    expect(body.pendingInvites).toBe(1);
    expect(body.invites).toHaveLength(1);
    expect(body.totalPledgedAmount).toBe("0");
  });
});
