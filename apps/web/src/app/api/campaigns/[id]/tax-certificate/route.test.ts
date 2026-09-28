import { beforeEach, describe, expect, it } from "vitest";
import { createCampaign, InMemoryCampaignDataSource, setCampaignDataSource } from "../../../../../services/campaign.service";
import { GET } from "./route";

describe("GET /api/campaigns/[id]/tax-certificate", () => {
  const dataSource = new InMemoryCampaignDataSource();
  const campaignId = "certificate-route-campaign";

  beforeEach(async () => {
    setCampaignDataSource(dataSource);
    const campaign = await createCampaign({
      id: campaignId,
      creator: "creator",
      name: "Community Garden",
      goalAmount: "1000",
      nonprofitPartner: { legalName: "Garden Foundation", registrationNumber: "NP-1", country: "US" },
    }, dataSource);
    await dataSource.saveCampaign({
      ...campaign,
      nonprofitPartner: { ...campaign.nonprofitPartner!, verificationStatus: "VERIFIED" },
      sponsors: [{
        id: "sponsor-1",
        campaignId,
        address: "G-SPONSOR",
        amount: "100",
        token: "USDC",
        sponsoredAt: Date.UTC(2025, 5, 1),
      }],
    });
  });

  it("streams the sponsor's PDF certificate without caching it", async () => {
    const response = await GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/tax-certificate?sponsorAddress=G-SPONSOR&taxYear=2025`),
      { params: Promise.resolve({ id: campaignId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain("charitable-contribution-");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("rejects invalid request parameters", async () => {
    const response = await GET(
      new Request(`http://localhost/api/campaigns/${campaignId}/tax-certificate?sponsorAddress=G-SPONSOR&taxYear=99`),
      { params: Promise.resolve({ id: campaignId }) },
    );
    expect(response.status).toBe(400);
  });
});