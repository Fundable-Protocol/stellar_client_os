import { beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "@/services/campaign.service";
import {
  InMemoryPartnershipDataSource,
  setPartnershipDataSource,
} from "@/services/campaign-partnership.service";

const CAMPAIGN = "partner-route-campaign";

async function seededCampaign() {
  const dataSource = new InMemoryCampaignDataSource();
  setCampaignDataSource(dataSource);
  return createCampaign(
    { id: CAMPAIGN, creator: "GPLACEHOLDER", name: "Community Canopy", goalAmount: "1000" },
    dataSource,
  );
}

function partnershipRequest(body: unknown) {
  return new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: CAMPAIGN }) };

describe("/api/campaigns/:id/partnerships", () => {
  beforeEach(async () => {
    setPartnershipDataSource(new InMemoryPartnershipDataSource());
    await seededCampaign();
  });

  it("lists the campaign's partnership requests", async () => {
    const empty = await GET(new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships`), params);
    expect(empty.status).toBe(200);
    expect((await empty.json()).data).toEqual([]);

    await POST(
      partnershipRequest({ ngoId: "ngo-1", servicesRequested: ["PLANTING_LABOR"] }),
      params,
    );
    const listed = await GET(new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships`), params);
    const { data: requests } = await listed.json();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ status: "PENDING", ngoId: "ngo-1" });
  });

  it("creates a partnership request for a verified NGO", async () => {
    const response = await POST(
      partnershipRequest({
        ngoId: "ngo-1",
        servicesRequested: ["VERIFICATION"],
        proposedTerms: "Verify 1,000 trees within 30 days",
      }),
      params,
    );
    expect(response.status).toBe(201);
    const { data } = await response.json();
    expect(data).toMatchObject({
      campaignId: CAMPAIGN,
      ngoId: "ngo-1",
      ngoName: "Global Tree Planters",
      servicesRequested: ["VERIFICATION"],
      status: "PENDING",
      proposedTerms: "Verify 1,000 trees within 30 days",
      initiatedBy: "GPLACEHOLDER",
    });
  });

  it("returns 404 for an unknown campaign", async () => {
    const response = await POST(
      new Request("http://test/api/campaigns/missing/partnerships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ngoId: "ngo-1", servicesRequested: ["PLANTING_LABOR"] }),
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(response.status).toBe(404);
  });

  it("rejects requests to unverified or unknown NGOs", async () => {
    const unverified = await POST(
      partnershipRequest({ ngoId: "ngo-3", servicesRequested: ["PLANTING_LABOR"] }),
      params,
    );
    expect(unverified.status).toBe(409);
    expect((await unverified.json()).code).toBe("NGO_NOT_VERIFIED");

    const unknown = await POST(
      partnershipRequest({ ngoId: "ngo-missing", servicesRequested: ["PLANTING_LABOR"] }),
      params,
    );
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).code).toBe("NGO_NOT_FOUND");
  });

  it("rejects unoffered services", async () => {
    const response = await POST(
      partnershipRequest({ ngoId: "ngo-1", servicesRequested: ["LAND_ACCESS"] }),
      params,
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("SERVICE_NOT_OFFERED");
  });

  it("rejects an invalid request body", async () => {
    const missing = await POST(partnershipRequest({ ngoId: "ngo-1" }), params);
    expect(missing.status).toBe(400);

    const badService = await POST(
      partnershipRequest({ ngoId: "ngo-1", servicesRequested: ["NOPE"] }),
      params,
    );
    expect(badService.status).toBe(400);
  });

  it("blocks duplicate active requests", async () => {
    await POST(partnershipRequest({ ngoId: "ngo-1", servicesRequested: ["PLANTING_LABOR"] }), params);
    const duplicate = await POST(
      partnershipRequest({ ngoId: "ngo-1", servicesRequested: ["PLANTING_LABOR"] }),
      params,
    );
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("DUPLICATE_ACTIVE_PARTNERSHIP");
  });
});