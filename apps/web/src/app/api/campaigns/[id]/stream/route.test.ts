import { beforeEach, describe, expect, it } from "vitest";
import {
  InMemoryCampaignDataSource,
  getCampaign,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { DELETE, GET, PUT } from "./route";

const CREATOR = "GSTREAMROUTECREATOR";
const OTHER = "GSTREAMROUTENOTCREATOR";
const YT_ID = "dQw4w9WgXcQ";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-stream-route",
    creator: CREATOR,
    name: "Stream route campaign",
    status: "ACTIVE",
    goalAmount: "50000",
    raisedAmount: "0",
    sponsorCount: 0,
    treeCount: 0,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    statusChangedAt: 1_700_000_000_000,
    sponsors: [],
    ...overrides,
  };
}

const putRequest = (id: string, body: unknown, raw?: string) =>
  new Request(`http://localhost/api/campaigns/${id}/stream`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

let dataSource: InMemoryCampaignDataSource;

beforeEach(() => {
  dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
});

describe("GET /api/campaigns/[id]/stream", () => {
  it("404s for an unknown campaign", async () => {
    const response = await GET(new Request("http://localhost/api/campaigns/nope/stream"), params("nope"));
    expect(response.status).toBe(404);
  });

  it("returns a null stream for a campaign without one, plus the owner address", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const response = await GET(
      new Request(`http://localhost/api/campaigns/${record.id}/stream`),
      params(record.id),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      campaignId: record.id,
      creator: CREATOR,
      liveStream: null,
    });
  });

  it("sets a private no-store cache header", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const response = await GET(
      new Request(`http://localhost/api/campaigns/${record.id}/stream`),
      params(record.id),
    );
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });
});

describe("PUT /api/campaigns/[id]/stream", () => {
  it("lets the creator attach a validated stream and persists it", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const response = await PUT(
      putRequest(record.id, {
        streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
        replayUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
        title: "Live from the nursery",
        requestedBy: CREATOR,
      }),
      params(record.id),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.liveStream).toMatchObject({
      platform: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      title: "Live from the nursery",
    });

    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream?.replayUrl).toBe(`https://www.youtube.com/watch?v=${YT_ID}`);
  });

  it("rejects non-creators with 403", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const response = await PUT(
      putRequest(record.id, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`, requestedBy: OTHER }),
      params(record.id),
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeUndefined();
  });

  it("rejects unsupported URLs with 400", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const response = await PUT(
      putRequest(record.id, { streamUrl: "https://evil.example.com/watch", requestedBy: CREATOR }),
      params(record.id),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "VALIDATION" });
  });

  it("requires requestedBy and streamUrl", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());

    const missingIdentity = await PUT(
      putRequest(record.id, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` }),
      params(record.id),
    );
    expect(missingIdentity.status).toBe(400);

    const missingUrl = await PUT(putRequest(record.id, { requestedBy: CREATOR }), params(record.id));
    expect(missingUrl.status).toBe(400);
  });

  it("rejects an unparseable body with 400", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const response = await PUT(putRequest(record.id, {}, "{not json"), params(record.id));
    expect(response.status).toBe(400);
  });

  it("404s for an unknown campaign", async () => {
    const response = await PUT(
      putRequest("missing", { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`, requestedBy: CREATOR }),
      params("missing"),
    );
    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/campaigns/[id]/stream", () => {
  it("lets the creator remove the stream and its replay link", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    await dataSource.saveCampaign({
      ...record,
      liveStream: {
        platform: "youtube",
        streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
        addedAt: 1,
        updatedAt: 1,
      },
    });

    const response = await DELETE(
      new Request(
        `http://localhost/api/campaigns/${record.id}/stream?requestedBy=${encodeURIComponent(CREATOR)}`,
        { method: "DELETE" },
      ),
      params(record.id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).liveStream).toBeNull();
    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeUndefined();
  });

  it("rejects removal by non-creators with 403", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    await dataSource.saveCampaign({
      ...record,
      liveStream: {
        platform: "youtube",
        streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
        addedAt: 1,
        updatedAt: 1,
      },
    });

    const response = await DELETE(
      new Request(
        `http://localhost/api/campaigns/${record.id}/stream?requestedBy=${encodeURIComponent(OTHER)}`,
        { method: "DELETE" },
      ),
      params(record.id),
    );

    expect(response.status).toBe(403);
    const stored = await getCampaign(record.id, dataSource);
    expect(stored?.liveStream).toBeDefined();
  });

  it("rejects an identity-less removal with 403", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const response = await DELETE(
      new Request(`http://localhost/api/campaigns/${record.id}/stream`, { method: "DELETE" }),
      params(record.id),
    );
    expect(response.status).toBe(403);
  });
});
