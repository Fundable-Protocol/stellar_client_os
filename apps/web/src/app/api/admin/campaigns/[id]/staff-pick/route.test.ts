import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaign, getCampaignDataSource } from "@/services/campaign.service";
import { DELETE, PUT } from "./route";

const KEY = "test-admin-key";
const campaignId = "staff-pick-route-campaign";
const params = (id = campaignId) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown, auth: string | null = `Bearer ${KEY}`) =>
  new Request("http://test/api/admin/campaigns/x/staff-pick", {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(async () => {
  vi.stubEnv("ADMIN_API_KEY", KEY);
  const ds = getCampaignDataSource();
  await ds.saveCampaign({
    id: campaignId,
    creator: "creator",
    name: "Save the Forest",
    goalAmount: "1000",
    raisedAmount: "500",
    sponsorCount: 1,
    treeCount: 10,
    status: "ACTIVE",
    createdAt: 1000,
    updatedAt: 1000,
    statusChangedAt: 1000,
    sponsors: [],
    statusHistory: [],
  });
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/admin/campaigns/:id/staff-pick", () => {
  it("rejects unauthorized requests", async () => {
    expect((await PUT(request("PUT", {}, null), params())).status).toBe(401);
    expect((await DELETE(request("DELETE", undefined, "Bearer wrong"), params())).status).toBe(401);
  });

  it("adds and removes staff pick curation", async () => {
    const put = await PUT(
      request("PUT", { reason: "Outstanding local community engagement" }),
      params(),
    );
    expect(put.status).toBe(200);
    const putData = await put.json();
    expect(putData.isStaffPick).toBe(true);
    expect(putData.staffPickReason).toBe("Outstanding local community engagement");

    const del = await DELETE(request("DELETE"), params());
    expect(del.status).toBe(200);
    const delData = await del.json();
    expect(delData.isStaffPick).toBe(false);
  });

  it("returns 404 for unknown campaign", async () => {
    expect((await PUT(request("PUT", {}), params("unknown-id"))).status).toBe(404);
    expect((await DELETE(request("DELETE"), params("unknown-id"))).status).toBe(404);
  });
});
