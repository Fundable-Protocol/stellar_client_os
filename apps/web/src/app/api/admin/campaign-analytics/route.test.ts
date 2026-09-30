import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  AdminCampaignAnalyticsService,
  setAdminCampaignAnalyticsService,
  type AdminAnalyticsDataSource,
} from "@/services/admin-campaign-analytics.service";

const KEY = "test-admin-key";
const DAY = 86_400;
const NOW = 100 * DAY;

const dataSource: AdminAnalyticsDataSource = {
  getCampaigns: async () => [
    {
      id: "1",
      title: "Mangrove Belt",
      creator: "GMANGROVE",
      status: "Active",
      createdAt: 0,
      completedAt: null,
      targetAmount: "100000000",
      totalRaised: "50000000",
      sponsorCount: 2,
      species: [{ speciesId: "oak", trees: 10 }],
    },
  ],
  getSponsorships: async () => [
    { campaignId: "1", sponsorAddress: "GA", amount: "30000000", at: NOW - DAY },
    { campaignId: "1", sponsorAddress: "GB", amount: "20000000", at: NOW - 2 * DAY },
  ],
};

const get = (query = "", headers: Record<string, string> = { authorization: `Bearer ${KEY}` }, signal?: AbortSignal) =>
  GET(new NextRequest(`http://test/api/admin/campaign-analytics${query}`, { headers, signal }));

beforeEach(() => {
  vi.stubEnv("ADMIN_API_KEY", KEY);
  setAdminCampaignAnalyticsService(new AdminCampaignAnalyticsService({ dataSource, clock: () => NOW }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  setAdminCampaignAnalyticsService(null);
});

describe("GET /api/admin/campaign-analytics", () => {
  it("returns the admin metrics snapshot", async () => {
    const response = await get();
    const { data } = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(data.campaigns.active).toBe(1);
    expect(data.trees.planted).toBe(10);
    expect(data.co2.sequesteredPerYearKg).toBe(210);
    expect(data.sponsors).toMatchObject({ total: 2, newInWindow: 2 });
    expect(data.completion.rate).toBeNull();
    expect(data.revenue).toMatchObject({ totalXlm: 5, inWindowXlm: 5 });
    expect(data.window.days).toBe(30);
  });

  it("honours the window and network", async () => {
    const { data } = await (await get("?windowDays=7&network=mainnet")).json();

    expect(data.window.days).toBe(7);
    expect(data.network).toBe("mainnet");
  });

  it("requires the admin key", async () => {
    expect((await get("", {})).status).toBe(401);
    expect((await get("", { authorization: "Bearer wrong" })).status).toBe(401);
  });

  it("fails closed when no admin key is configured", async () => {
    vi.stubEnv("ADMIN_API_KEY", "");

    expect((await get()).status).toBe(503);
  });

  it.each(["?windowDays=0", "?windowDays=400", "?network=devnet", "?stream=yes", "?intervalSeconds=1"])(
    "rejects %s",
    async (query) => {
      expect((await get(query)).status).toBe(400);
    },
  );

  it("returns 500 without leaking internals when the data source fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setAdminCampaignAnalyticsService(
      new AdminCampaignAnalyticsService({
        dataSource: {
          ...dataSource,
          getCampaigns: async () => {
            throw new Error("indexer at 10.0.0.4 refused");
          },
        },
      }),
    );

    const response = await get();

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Failed to compute campaign analytics" });
    errorSpy.mockRestore();
  });

  it("streams snapshots as server-sent events", async () => {
    const controller = new AbortController();
    const response = await get("?stream=1&intervalSeconds=5", undefined, controller.signal);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("event: analytics")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    while (!text.endsWith("\n\n")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }

    expect(text).toContain("retry: 5000");
    const data = JSON.parse(text.split("event: analytics\ndata: ")[1].split("\n")[0]);
    expect(data.trees.planted).toBe(10);

    controller.abort();
    await reader.cancel();
  });

  it("does not stream without the admin key", async () => {
    const response = await get("?stream=1", {});

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
