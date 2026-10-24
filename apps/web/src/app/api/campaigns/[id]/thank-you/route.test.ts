import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { GET, PUT } from "./route";

const ID = "thank-you-campaign";
const CREATOR = "GCREATOR";
const context = { params: Promise.resolve({ id: ID }) };

function put(body: unknown) {
  return new Request(`http://localhost/api/campaigns/${ID}/thank-you`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/:id/thank-you", () => {
  beforeEach(async () => {
    const dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign({ id: ID, creator: CREATOR, name: "Thank-you test", goalAmount: "100" }, dataSource);
  });

  it("saves and returns the creator greeting, rich text, image, video, and next steps", async () => {
    const response = await PUT(put({
      creatorAddress: CREATOR,
      greeting: "Thank you!",
      body: "We **did it**.",
      imageUrl: "https://example.com/campaign.jpg",
      videoUrl: "https://youtu.be/abc123",
      nextSteps: "Updates are coming.",
    }), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      greeting: "Thank you!",
      body: "We **did it**.",
      imageUrl: "https://example.com/campaign.jpg",
      videoUrl: "https://youtu.be/abc123",
      nextSteps: "Updates are coming.",
    });

    const loaded = await GET(new Request(`http://localhost/api/campaigns/${ID}/thank-you`), context);
    expect(await loaded.json()).toMatchObject({ greeting: "Thank you!", videoUrl: "https://youtu.be/abc123" });
  });

  it("rejects non-creators, unsafe media URLs, and oversized copy", async () => {
    expect((await PUT(put({ creatorAddress: "GOTHER", greeting: "", body: "", nextSteps: "" }), context)).status).toBe(403);
    expect((await PUT(put({ creatorAddress: CREATOR, greeting: "", body: "", nextSteps: "", imageUrl: "http://example.com/a.jpg" }), context)).status).toBe(400);
    expect((await PUT(put({ creatorAddress: CREATOR, greeting: "", body: "", nextSteps: "", videoUrl: "https://example.com/embed" }), context)).status).toBe(400);
    expect((await PUT(put({ creatorAddress: CREATOR, greeting: "", body: "x".repeat(2001), nextSteps: "" }), context)).status).toBe(400);
  });
});
