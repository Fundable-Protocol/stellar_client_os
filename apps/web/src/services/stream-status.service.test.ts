import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CampaignLiveStream } from "@/lib/live-stream";
import {
  LIVE_STATUS_TTL_MS,
  OFFLINE_STATUS_TTL_MS,
  getLiveStreamStatus,
  getLiveStreamStatusForCampaigns,
  resetLiveStreamStatusCache,
} from "./stream-status.service";

const YT_ID = "dQw4w9WgXcQ";
const YT_ENV = { YOUTUBE_API_KEY: "test-key" };
const TWITCH_ENV = { TWITCH_CLIENT_ID: "client-id", TWITCH_APP_TOKEN: "app-token" };

function youtubeStream(videoId = YT_ID): CampaignLiveStream {
  return {
    platform: "youtube",
    streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
    addedAt: 1,
    updatedAt: 1,
  };
}

function twitchStream(channel = "somechannel"): CampaignLiveStream {
  return {
    platform: "twitch",
    streamUrl: `https://www.twitch.tv/${channel}`,
    addedAt: 1,
    updatedAt: 1,
  };
}

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

beforeEach(() => {
  resetLiveStreamStatusCache();
});

afterEach(() => {
  resetLiveStreamStatusCache();
  vi.restoreAllMocks();
});

describe("getLiveStreamStatus — YouTube", () => {
  it("degrades to unknown/not_configured without an API key and never calls the provider", async () => {
    const fetchImpl = vi.fn();
    const result = await getLiveStreamStatus(youtubeStream(), { fetchImpl, env: {} });
    expect(result).toMatchObject({ status: "unknown", reason: "not_configured", provider: "youtube", source: "provider" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports live only when the provider says the broadcast has started and not ended", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ items: [{ liveStreamingDetails: { actualStartTime: "2026-01-01T00:00:00Z" } }] }),
    );
    const result = await getLiveStreamStatus(youtubeStream(), { fetchImpl, env: YT_ENV });

    expect(result).toMatchObject({ status: "live", provider: "youtube", source: "provider" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("googleapis.com/youtube/v3/videos");
    expect(String(url)).toContain(`id=${YT_ID}`);
    expect(String(url)).toContain("key=test-key");
    expect((init as RequestInit).headers).toMatchObject({ Accept: "application/json" });
  });

  it("reports offline when the broadcast already ended", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            liveStreamingDetails: {
              actualStartTime: "2026-01-01T00:00:00Z",
              actualEndTime: "2026-01-01T02:00:00Z",
            },
          },
        ],
      }),
    );
    const result = await getLiveStreamStatus(youtubeStream("abcdefghijk"), { fetchImpl, env: YT_ENV });
    expect(result.status).toBe("offline");
  });

  it("reports offline when the video has no live streaming details", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{}] }));
    const result = await getLiveStreamStatus(youtubeStream("ijklmnopqrs"), { fetchImpl, env: YT_ENV });
    expect(result.status).toBe("offline");
  });

  it("degrades to unknown/provider_error when the provider responds with an error", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ error: "quota" }, false));
    const result = await getLiveStreamStatus(youtubeStream("mnopqrstuvw"), { fetchImpl, env: YT_ENV });
    expect(result).toMatchObject({ status: "unknown", reason: "provider_error" });
  });

  it("degrades to unknown/provider_error when the provider call throws", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("network down"));
    const result = await getLiveStreamStatus(youtubeStream("qrstuvwxyza"), { fetchImpl, env: YT_ENV });
    expect(result).toMatchObject({ status: "unknown", reason: "provider_error" });
  });
});

describe("getLiveStreamStatus — Twitch", () => {
  it("degrades to unknown/not_configured without credentials and never calls the provider", async () => {
    const fetchImpl = vi.fn();
    const result = await getLiveStreamStatus(twitchStream(), { fetchImpl, env: {} });
    expect(result).toMatchObject({ status: "unknown", reason: "not_configured", provider: "twitch" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("reports live only when Helix returns an active stream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "123", user_login: "somechannel" }] }));
    const result = await getLiveStreamStatus(twitchStream(), { fetchImpl, env: TWITCH_ENV });

    expect(result).toMatchObject({ status: "live", provider: "twitch" });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain("api.twitch.tv/helix/streams");
    expect(String(url)).toContain("user_login=somechannel");
    expect((init as RequestInit).headers).toMatchObject({
      "Client-Id": "client-id",
      Authorization: "Bearer app-token",
    });
  });

  it("reports offline when Helix returns no active stream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const result = await getLiveStreamStatus(twitchStream("otherchannel"), { fetchImpl, env: TWITCH_ENV });
    expect(result.status).toBe("offline");
  });

  it("treats a stored VOD reference as offline without contacting the provider", async () => {
    const fetchImpl = vi.fn();
    const result = await getLiveStreamStatus(
      { platform: "twitch", streamUrl: "https://www.twitch.tv/videos/555", addedAt: 1, updatedAt: 1 },
      { fetchImpl, env: TWITCH_ENV },
    );
    expect(result).toMatchObject({ status: "offline", provider: "twitch" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("degrades to unknown/provider_error on provider failure", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const result = await getLiveStreamStatus(twitchStream("failchannel"), { fetchImpl, env: TWITCH_ENV });
    expect(result).toMatchObject({ status: "unknown", reason: "provider_error" });
  });
});

describe("getLiveStreamStatus — defensiveness and caching", () => {
  it("short-circuits tampered records to unknown/unsupported_url without a network call", async () => {
    const fetchImpl = vi.fn();
    const result = await getLiveStreamStatus(
      { platform: "youtube", streamUrl: "https://www.twitch.tv/somechannel", addedAt: 1, updatedAt: 1 },
      { fetchImpl, env: { ...YT_ENV, ...TWITCH_ENV } },
    );
    expect(result).toMatchObject({ status: "unknown", reason: "unsupported_url" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("serves repeated checks from cache and honours the live TTL", async () => {
    let now = 10_000;
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ items: [{ liveStreamingDetails: { actualStartTime: "2026-01-01T00:00:00Z" } }] }),
    );
    const options = { fetchImpl, env: YT_ENV, now: () => now };

    const first = await getLiveStreamStatus(youtubeStream("cachevid001"), options);
    const second = await getLiveStreamStatus(youtubeStream("cachevid001"), options);
    expect(first.source).toBe("provider");
    expect(second).toMatchObject({ status: "live", source: "cache", checkedAt: first.checkedAt });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    // Past the live TTL the status must be re-checked with the provider.
    now += LIVE_STATUS_TTL_MS + 1;
    const third = await getLiveStreamStatus(youtubeStream("cachevid001"), options);
    expect(third.source).toBe("provider");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("keeps offline results cached for the longer offline TTL", async () => {
    let now = 10_000;
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{}] }));
    const options = { fetchImpl, env: YT_ENV, now: () => now };

    await getLiveStreamStatus(youtubeStream("cachevid002"), options);
    now += OFFLINE_STATUS_TTL_MS - 1;
    const cached = await getLiveStreamStatus(youtubeStream("cachevid002"), options);
    expect(cached.source).toBe("cache");
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 2;
    const refreshed = await getLiveStreamStatus(youtubeStream("cachevid002"), options);
    expect(refreshed.source).toBe("provider");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("resetLiveStreamStatusCache clears cached entries", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{}] }));
    const options = { fetchImpl, env: YT_ENV };
    await getLiveStreamStatus(youtubeStream("cachevid003"), options);
    await getLiveStreamStatus(youtubeStream("cachevid003"), options);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    resetLiveStreamStatusCache();
    await getLiveStreamStatus(youtubeStream("cachevid003"), options);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe("getLiveStreamStatusForCampaigns", () => {
  it("only returns statuses for campaigns with a configured stream", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ items: [{}] }));
    const map = await getLiveStreamStatusForCampaigns(
      [
        { id: "camp-a", liveStream: youtubeStream("batchvid001") },
        { id: "camp-b" },
        { id: "camp-c", liveStream: twitchStream("batchchannel") },
      ],
      { fetchImpl, env: { ...YT_ENV, ...TWITCH_ENV } },
    );

    expect([...map.keys()].sort()).toEqual(["camp-a", "camp-c"]);
    expect(map.get("camp-a")?.provider).toBe("youtube");
    expect(map.get("camp-c")?.provider).toBe("twitch");
  });
});
