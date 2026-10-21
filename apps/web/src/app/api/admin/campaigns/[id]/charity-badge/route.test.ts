import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCampaign, getCampaignDataSource } from "@/services/campaign.service";
import { DELETE, PUT } from "./route";

const KEY = "test-admin-key";
const campaignId = "charity-badge-route-campaign";
const params = (id = campaignId) => ({ params: Promise.resolve({ id }) });
const request = (method: string, body?: unknown, auth: string | null = `Bearer ${KEY}`) =>
  new Request("http://test/api/admin/campaigns/x/charity-badge", {
    method,
    headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const valid = { type: "TAX_EXEMPT", documentationUrl: "https://example.org/letter.pdf", awardedBy: "admin" };

beforeEach(async () => {
  vi.stubEnv("ADMIN_API_KEY", KEY);
  await createCampaign({ id: campaignId, creator: "creator", name: "Food Bank", goalAmount: "1000" }, getCampaignDataSource());
});

afterEach(() => vi.unstubAllEnvs());

describe("/api/admin/campaigns/:id/charity-badge", () => {
  it("rejects requests without admin credentials", async () => {
    expect((await PUT(request("PUT", valid, null), params())).status).toBe(401);
    expect((await DELETE(request("DELETE", undefined, "Bearer wrong"), params())).status).toBe(401);
  });

  it("awards and revokes a badge", async () => {
    const put = await PUT(request("PUT", valid), params());
    expect(put.status).toBe(200);
    expect((await put.json()).charityBadge).toMatchObject({ type: "TAX_EXEMPT", documentationUrl: valid.documentationUrl });

    const del = await DELETE(request("DELETE"), params());
    expect(del.status).toBe(200);
    expect((await del.json()).charityBadge).toBeNull();
  });

  it("validates input and unknown campaigns", async () => {
    expect((await PUT(request("PUT", { ...valid, type: "GOLD" }), params())).status).toBe(400);
    expect((await PUT(request("PUT", valid), params("nope"))).status).toBe(404);
  });
});
