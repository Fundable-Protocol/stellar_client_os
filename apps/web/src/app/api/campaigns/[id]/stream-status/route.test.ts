import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  InMemoryCampaignDataSource,
  setCampaignDataSource,
  type CampaignRecord,
} from "@/services/campaign.service";
import { resetLiveStreamStatusCache } from "@/services/stream-status.service";
import { GET } from "./route";

const CREATOR = "GSTATUSROUTECREATOR";
const YT_ID = "dQw4w9WgXcQ";

const params = (id: string) => ({ params: Promise.resolve({ id }) });

function makeCampaign(overrides: Partial<CampaignRecord> = {}): CampaignRecord {
  return {
    id: "camp-status-route",
    creator: CREATOR,
    name: "Status route campaign",
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

let dataSource: InMemoryCampaignDataSource;

beforeEach(() => {
  dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
  resetLiveStreamStatusCache();
  vi.stubEnv("YOUTUBE_API_KEY", "");
  vi.stubEnv("TWITCH_CLIENT_ID", "");
  vi.stubEnv("TWITCH_APP_TOKEN", "");
});

afterEach(() => {
  resetLiveStreamStatusCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function seedWithStream(): Promise<string> {
  const record = await dataSource.saveCampaign(makeCampaign());
  await dataSource.saveCampaign({
    ...record,
    liveStream: {
      platform: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      title: "Live now",
      addedAt: 1,
      updatedAt: 1,
    },
  });
  return record.id;
}

describe("GET /api/campaigns/[id]/stream-status", () => {
  it("404s for an unknown campaign", async () => {
    const response = await GET(new Request("http://localhost/api/campaigns/nope/stream-status"), params("nope"));
    expect(response.status).toBe(404);
  });

  it("returns a null status when no stream is configured", async () => {
    const record = await dataSource.saveCampaign(makeCampaign());
    const response = await GET(
      new Request(`http://localhost/api/campaigns/${record.id}/stream-status`),
      params(record.id),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      campaignId: record.id,
      liveStream: null,
      status: null,
      checkedAt: null,
      source: null,
    });
  });

  it("degrades to unknown/not_configured when provider credentials are absent — never claiming live", async () => {
    const id = await seedWithStream();
    const response = await GET(new Request(`http://localhost/api/campaigns/${id}/stream-status`), params(id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("unknown");
    expect(body.reason).toBe("not_configured");
    expect(body.liveStream).toMatchObject({
      platform: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      replayUrl: null,
      title: "Live now",
    });
  });

  it("reports live when the provider confirms the broadcast", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [{ liveStreamingDetails: { actualStartTime: "2026-01-01T00:00:00Z" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const id = await seedWithStream();
    const response = await GET(new Request(`http://localhost/api/campaigns/${id}/stream-status`), params(id));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("live");
    expect(body.source).toBe("provider");
    expect(body.checkedAt).toBeTypeOf("number");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("reports offline when the provider says the broadcast ended", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{}] }) }),
    );

    const id = await seedWithStream();
    const response = await GET(new Request(`http://localhost/api/campaigns/${id}/stream-status`), params(id));

    const body = await response.json();
    expect(body.status).toBe("offline");
  });

  it("serves the second check from the in-process cache", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [{}] }) });
    vi.stubGlobal("fetch", fetchMock);

    const id = await seedWithStream();
    const first = await (await GET(new Request(`http://localhost/api/campaigns/${id}/stream-status`), params(id))).json();
    const second = await (await GET(new Request(`http://localhost/api/campaigns/${id}/stream-status`), params(id))).json();

    expect(first.source).toBe("provider");
    expect(second.source).toBe("cache");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
