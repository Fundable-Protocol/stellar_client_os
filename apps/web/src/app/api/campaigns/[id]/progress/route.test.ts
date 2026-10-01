import { describe, expect, it, vi } from "vitest";
import { GET, DELETE } from "./route";
import { campaignProgressCache } from "@/services/campaign-progress-cache.service";

describe("Campaign Progress Route", () => {
  it("returns cached progress metrics with X-Cache header", async () => {
    vi.spyOn(campaignProgressCache, "getOrFetch").mockResolvedValue({
      metrics: {
        campaignId: "c-1",
        treeCount: 250,
        sponsorCount: 15,
        co2ImpactKg: 5000,
        co2SequestrationTonnes: "5.00",
        raisedAmount: "2500",
        goalAmount: "10000",
        cachedAt: Date.now(),
        expiresAt: Date.now() + 300000,
        ttlSeconds: 300,
      },
      cacheHit: true,
    });

    const req = new Request("http://localhost/api/campaigns/c-1/progress");
    const res = await GET(req, { params: Promise.resolve({ id: "c-1" }) });

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Cache")).toBe("HIT");
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");

    const json = await res.json();
    expect(json.treeCount).toBe(250);
    expect(json.cacheStatus).toBe("HIT");
  });

  it("handles 404 for missing campaign", async () => {
    vi.spyOn(campaignProgressCache, "getOrFetch").mockRejectedValue(
      new Error("Campaign non-existent not found")
    );

    const req = new Request("http://localhost/api/campaigns/non-existent/progress");
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  it("invalidates cache on DELETE", async () => {
    vi.spyOn(campaignProgressCache, "invalidate").mockReturnValue(true);

    const req = new Request("http://localhost/api/campaigns/c-1/progress", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.invalidated).toBe(true);
  });
});