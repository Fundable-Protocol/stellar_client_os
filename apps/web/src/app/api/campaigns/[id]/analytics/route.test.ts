import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../../services/campaign.service";
import { GET, POST } from "./route";

describe("campaign analytics API (#705)", () => {
  const dataSource = new InMemoryCampaignDataSource();

  beforeEach(async () => {
    setCampaignDataSource(dataSource);
    await createCampaign({ id: "api-analytics", creator: "creator", name: "API test", goalAmount: "1000" }, dataSource);
  });

  it("records activity events and returns fresh metrics", async () => {
    const params = { params: Promise.resolve({ id: "api-analytics" }) };
    const post = (body: object) => POST(new Request("http://localhost/api/campaigns/api-analytics/analytics", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }) as never, params);

    await post({ event: "view", viewerId: "viewer-1" });
    await post({ event: "view", viewerId: "viewer-2" });
    await post({ event: "contribution", sponsor: "viewer-1", amount: "250" });
    await post({ event: "refund" });

    const response = await GET(new Request("http://localhost/api/campaigns/api-analytics/analytics") as never, params);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(await response.json()).toMatchObject({
      data: {
        pagesViewed: 2,
        uniqueViewers: 2,
        sponsors: 1,
        sponsorRate: 50,
        abandonmentRate: 50,
        averageContributionSize: "250",
        refunds: 1,
        refundRate: 100,
      },
    });
  });
});
