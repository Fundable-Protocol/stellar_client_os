import { describe, expect, it, beforeEach } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../services/campaign.service";
import { GET } from "./route";

describe("GET /api/campaigns/:id freshness (#704)", () => {
  const dataSource = new InMemoryCampaignDataSource();

  beforeEach(async () => {
    setCampaignDataSource(dataSource);
    await createCampaign({ id: "fresh-campaign", creator: "creator", name: "Fresh", goalAmount: "1000" }, dataSource);
  });

  it("returns campaign status with no-store cache policy", async () => {
    const response = await GET(new Request("http://localhost/api/campaigns/fresh-campaign"), {
      params: Promise.resolve({ id: "fresh-campaign" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({ id: "fresh-campaign", sponsorCount: 0 });
  });
});
