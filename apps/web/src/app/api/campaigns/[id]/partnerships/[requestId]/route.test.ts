import { beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";
import {
  createCampaign,
  InMemoryCampaignDataSource,
  setCampaignDataSource,
} from "@/services/campaign.service";
import {
  InMemoryPartnershipDataSource,
  requestPartnership,
  setPartnershipDataSource,
} from "@/services/campaign-partnership.service";

const CAMPAIGN = "partner-request-route-campaign";
const OTHER_CAMPAIGN = "partner-request-other-campaign";

const params = { params: Promise.resolve({ id: CAMPAIGN, requestId: "req-1" }) };

function statusRequest(body: unknown, requestId = "req-1") {
  return new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships/${requestId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/:id/partnerships/:requestId", () => {
  beforeEach(async () => {
    setPartnershipDataSource(new InMemoryPartnershipDataSource());
    const dataSource = new InMemoryCampaignDataSource();
    setCampaignDataSource(dataSource);
    await createCampaign(
      { id: CAMPAIGN, creator: "GPLACEHOLDER", name: "Community Canopy", goalAmount: "1000" },
      dataSource,
    );
    await createCampaign(
      { id: OTHER_CAMPAIGN, creator: "GOTHER", name: "Other Grove", goalAmount: "500" },
      dataSource,
    );
  });

  it("returns a single request that belongs to the campaign", async () => {
    const created = await requestPartnership(CAMPAIGN, "ngo-1", ["PLANTING_LABOR"], undefined, "GPLACEHOLDER");
    const response = await GET(new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships/${created.id}`), {
      params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }),
    });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ id: created.id, campaignId: CAMPAIGN, ngoId: "ngo-1" });
  });

  it("hides requests that belong to another campaign", async () => {
    const created = await requestPartnership(OTHER_CAMPAIGN, "ngo-1", ["PLANTING_LABOR"]);
    const response = await GET(new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships/${created.id}`), {
      params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }),
    });
    expect(response.status).toBe(404);
  });

  it("returns 404 for unknown request ids", async () => {
    const response = await GET(new Request(`http://test/api/campaigns/${CAMPAIGN}/partnerships/req-missing`), {
      params: Promise.resolve({ id: CAMPAIGN, requestId: "req-missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("advances the request lifecycle", async () => {
    const created = await requestPartnership(CAMPAIGN, "ngo-1", ["PLANTING_LABOR"], undefined, "GPLACEHOLDER");
    const accept = await PATCH(
      statusRequest({ status: "ACCEPTED", updatedBy: "ngo-1" }, created.id),
      { params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }) },
    );
    expect(accept.status).toBe(200);
    expect((await accept.json()).data).toMatchObject({ status: "ACCEPTED", updatedBy: "ngo-1" });

    const complete = await PATCH(
      statusRequest({ status: "COMPLETED" }, created.id),
      { params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }) },
    );
    expect(complete.status).toBe(200);
    expect((await complete.json()).data.status).toBe("COMPLETED");
  });

  it("rejects invalid transitions", async () => {
    const created = await requestPartnership(CAMPAIGN, "ngo-1", ["PLANTING_LABOR"]);
    const response = await PATCH(
      statusRequest({ status: "COMPLETED" }, created.id),
      { params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }) },
    );
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("INVALID_TRANSITION");
  });

  it("rejects invalid payloads and missing campaigns", async () => {
    const created = await requestPartnership(CAMPAIGN, "ngo-1", ["PLANTING_LABOR"]);
    const badBody = await PATCH(
      statusRequest({ status: "FROZEN" }, created.id),
      { params: Promise.resolve({ id: CAMPAIGN, requestId: created.id }) },
    );
    expect(badBody.status).toBe(400);

    const missingCampaign = await PATCH(
      statusRequest({ status: "ACCEPTED" }, created.id),
      { params: Promise.resolve({ id: "missing", requestId: created.id }) },
    );
    expect(missingCampaign.status).toBe(404);
  });
});