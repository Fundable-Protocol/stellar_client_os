import { describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

vi.mock("@/services/campaign.service", () => ({
  getCampaign: vi.fn().mockImplementation(async (id: string) => {
    if (id === "non-existent") return null;
    return {
      id,
      name: "Amazon Reforestation",
      treeCount: 1500,
      co2Sequestration: "12.5",
    };
  }),
}));

vi.mock("@/services/campaign-webhook.service", () => ({
  campaignWebhookService: {
    checkAndDispatchImpactMilestones: vi.fn().mockResolvedValue(["1000_trees", "10_tons_co2"]),
  },
}));

describe("Campaign Impact Milestones API Route", () => {
  it("returns 404 if campaign is not found on GET", async () => {
    const req = new Request("http://localhost/api/campaigns/non-existent/impact-milestones");
    const res = await GET(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  it("returns reached milestones and definitions on GET", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/impact-milestones");
    const res = await GET(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.campaignId).toBe("c-1");
    expect(data.reachedMilestones).toContain("1000_trees");
    expect(data.reachedMilestones).toContain("10_tons_co2");
    expect(data.definitions).toHaveLength(3);
  });

  it("returns 404 if campaign is not found on POST", async () => {
    const req = new Request("http://localhost/api/campaigns/non-existent/impact-milestones", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "non-existent" }) });
    expect(res.status).toBe(404);
  });

  it("evaluates and triggers impact milestones on POST", async () => {
    const req = new Request("http://localhost/api/campaigns/c-1/impact-milestones", {
      method: "POST",
      body: JSON.stringify({
        treeCount: 5500,
        co2Sequestration: "15",
        previouslyTriggered: ["1000_trees"],
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "c-1" }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.campaignId).toBe("c-1");
    expect(data.newlyTriggered).toEqual(["1000_trees", "10_tons_co2"]);
  });
});