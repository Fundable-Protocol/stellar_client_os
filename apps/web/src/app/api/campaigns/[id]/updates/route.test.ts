import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { resetCampaignUpdateDataSource } from "@/services/campaign-update.service";
import { resetCampaignUpdateNotificationStores } from "@/services/campaign-update-notification.service";

const CAMPAIGN_ID = "camp-101";
const CREATOR = "GD6W...X892";

function jsonRequest(body: unknown, url = `http://localhost/api/campaigns/${CAMPAIGN_ID}/updates`) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/[id]/updates route", () => {
  beforeEach(() => {
    resetCampaignUpdateDataSource();
    resetCampaignUpdateNotificationStores();
  });

  it("creates a draft update", async () => {
    const req = jsonRequest({
      creatorAddress: CREATOR,
      title: "Field report",
      bodyMarkdown: "We planted **120** trees.",
    });

    const res = await POST(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.update.status).toBe("draft");
    expect(body.update.title).toBe("Field report");
    expect(body.update.publishedAt).toBeUndefined();
  });

  it("rejects an update without a title", async () => {
    const req = jsonRequest({ creatorAddress: CREATOR, bodyMarkdown: "body" });
    const res = await POST(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Title");
  });

  it("requires a creator address", async () => {
    const req = jsonRequest({ title: "Field report", bodyMarkdown: "body" });
    const res = await POST(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(401);
  });

  it("publishes an update and reports the notification fan-out", async () => {
    const req = jsonRequest({
      creatorAddress: CREATOR,
      title: "Field report",
      bodyMarkdown: "We planted trees.",
      status: "published",
    });

    const res = await POST(req, { params: Promise.resolve({ id: CAMPAIGN_ID }) });
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.update.status).toBe("published");
    expect(body.update.publishedAt).toBeGreaterThan(0);
    expect(body.report).toBeDefined();
    expect(body.report.instantNotified).toBe(0);
  });

  it("lists published updates in chronological order", async () => {
    await POST(
      jsonRequest({
        creatorAddress: CREATOR,
        title: "first",
        bodyMarkdown: "one",
        status: "published",
      }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );
    await POST(
      jsonRequest({
        creatorAddress: CREATOR,
        title: "second",
        bodyMarkdown: "two",
        status: "published",
      }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    const res = await GET(new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/updates`), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.updates.map((update: { title: string }) => update.title)).toEqual([
      "first",
      "second",
    ]);
  });

  it("hides drafts from anonymous visitors", async () => {
    await POST(
      jsonRequest({ creatorAddress: CREATOR, title: "draft", bodyMarkdown: "one" }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    const anonymous = await GET(new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/updates`), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    expect((await anonymous.json()).updates).toHaveLength(0);

    const creator = await GET(
      new Request(
        `http://localhost/api/campaigns/${CAMPAIGN_ID}/updates?status=draft&viewerAddress=${CREATOR}`,
      ),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );
    expect((await creator.json()).updates).toHaveLength(1);
  });

  it("hides backers-only updates from anonymous visitors", async () => {
    await POST(
      jsonRequest({
        creatorAddress: CREATOR,
        title: "backers only",
        bodyMarkdown: "one",
        status: "published",
        visibility: "backers_only",
      }),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );

    const anonymous = await GET(new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/updates`), {
      params: Promise.resolve({ id: CAMPAIGN_ID }),
    });
    expect((await anonymous.json()).updates).toHaveLength(0);

    const backer = await GET(
      new Request(`http://localhost/api/campaigns/${CAMPAIGN_ID}/updates?viewerAddress=GBACKER`),
      { params: Promise.resolve({ id: CAMPAIGN_ID }) },
    );
    expect((await backer.json()).updates).toHaveLength(1);
  });
});
