import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InMemoryCampaignDataSource, setCampaignDataSource } from "@/services/campaign.service";
import { setCampaignLiveStream } from "@/services/campaign-live-stream.service";
import { resetLiveStreamStatusCache } from "@/services/stream-status.service";

vi.mock("@/middlewares/rate-limit.middleware", () => ({
  withCampaignApiRateLimit: (handler: (...args: any[]) => unknown) => handler,
}));

import { GET, POST } from "./route";

const CREATOR = "GLISTSTREAMCREATOR";
const YT_ID = "dQw4w9WgXcQ";

const post = (body: unknown) =>
  new Request("http://localhost/api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  setCampaignDataSource(new InMemoryCampaignDataSource());
  resetLiveStreamStatusCache();
  vi.stubEnv("YOUTUBE_API_KEY", "");
});

afterEach(() => {
  resetLiveStreamStatusCache();
  vi.unstubAllEnvs();
});

async function createCampaign(name: string): Promise<string> {
  const created = await POST(post({ creator: CREATOR, name, goalAmount: "1000" }));
  expect(created.status).toBe(201);
  return (await created.json()).id;
}

describe("campaign list stream enrichment (issue #1225)", () => {
  it("adds streamStatus only when includeStreamStatus=true", async () => {
    const id = await createCampaign("Streamed campaign");
    await setCampaignLiveStream(id, CREATOR, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` });

    const plain = await (await GET(new Request("http://localhost/api/campaigns"))).json();
    expect(plain.data).toHaveLength(1);
    expect(plain.data[0]).not.toHaveProperty("streamStatus");
    expect(plain.data[0]).not.toHaveProperty("streamStatusCheckedAt");

    const enriched = await (
      await GET(new Request("http://localhost/api/campaigns?includeStreamStatus=true"))
    ).json();
    expect(enriched.data).toHaveLength(1);
    expect(enriched.data[0].id).toBe(id);
    // No provider credentials in the test environment: an honest "unknown",
    // never a fabricated "live".
    expect(enriched.data[0].streamStatus).toBe("unknown");
    expect(enriched.data[0].streamStatusCheckedAt).toBeTypeOf("number");
  });

  it("leaves campaigns without a stream out of the enrichment", async () => {
    const plainId = await createCampaign("No stream campaign");
    const streamedId = await createCampaign("Has stream campaign");
    await setCampaignLiveStream(streamedId, CREATOR, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` });

    const enriched = await (
      await GET(new Request("http://localhost/api/campaigns?includeStreamStatus=true"))
    ).json();
    const byId = new Map<string, Record<string, unknown>>(
      enriched.data.map((campaign: { id: string }) => [campaign.id, campaign]),
    );
    expect(byId.get(plainId)).not.toHaveProperty("streamStatus");
    expect(byId.get(streamedId)).toMatchObject({ streamStatus: "unknown" });
  });

  it("reports live when the provider confirms it", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [{ liveStreamingDetails: { actualStartTime: "2026-01-01T00:00:00Z" } }] }),
      }),
    );

    const id = await createCampaign("Confirmed live campaign");
    await setCampaignLiveStream(id, CREATOR, { streamUrl: `https://www.youtube.com/watch?v=${YT_ID}` });

    const enriched = await (
      await GET(new Request("http://localhost/api/campaigns?includeStreamStatus=true"))
    ).json();
    expect(enriched.data[0]).toMatchObject({ streamStatus: "live" });
  });

  it("keeps the persisted stream metadata available to list consumers", async () => {
    const id = await createCampaign("Replay stays accessible");
    await setCampaignLiveStream(id, CREATOR, {
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      replayUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
    });

    const plain = await (await GET(new Request("http://localhost/api/campaigns"))).json();
    expect(plain.data[0].liveStream).toMatchObject({
      platform: "youtube",
      streamUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
      replayUrl: `https://www.youtube.com/watch?v=${YT_ID}`,
    });
  });
});
