import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/services/campaign.service", () => ({
  getCampaign: vi.fn().mockImplementation(async (id: string) => {
    if (id === "missing-camp") return null;
    return {
      id,
      name: "Mangrove Shield",
      costPerTree: 10,
    };
  }),
}));

describe("Campaign Sponsorship Tiers API Route", () => {
  it("returns 404 for non-existent campaign", async () => {
    const req = new Request("http://localhost/api/campaigns/missing-camp/sponsorship-tiers");
    const res = await GET(req, { params: Promise.resolve({ id: "missing-camp" }) });
    expect(res.status).toBe(404);
  });

  it("lists all tiers and calculates bulk pricing for 50 trees", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/sponsorship-tiers?treeCount=50");
    const res = await GET(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.tiers).toHaveLength(3);
    expect(json.calculated.tierId).toBe("growth");
    expect(json.calculated.discountPercentage).toBe(15);
    expect(json.calculated.grossAmount).toBe(500); // 50 * 10
    expect(json.calculated.netAmount).toBe(425); // 500 - 15%
    expect(json.calculated.savings).toBe(75);
  });

  it("calculates 25% discount for 100+ trees on impact tier", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/sponsorship-tiers?treeCount=120");
    const res = await GET(req, { params: Promise.resolve({ id: "c-1" }) });
    const json = await res.json();
    expect(json.calculated.tierId).toBe("impact");
    expect(json.calculated.discountPercentage).toBe(25);
    expect(json.calculated.grossAmount).toBe(1200);
    expect(json.calculated.netAmount).toBe(900); // 1200 - 25%
  });

  it("rejects POST with fewer than 10 trees", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/sponsorship-tiers", {
      method: "POST",
      body: JSON.stringify({ treeCount: 5 }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(400);
  });

  it("records sponsorship tier selection for impact tracking on POST", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/sponsorship-tiers", {
      method: "POST",
      body: JSON.stringify({ treeCount: 50, isAnonymous: true }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.tier.id).toBe("growth");
    expect(json.pricing.netAmount).toBe(425);
    expect(json.impactRecord.isAnonymous).toBe(true);
  });
});