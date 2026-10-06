import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, PATCH } from "./route";
import {
  InMemoryPartnershipDataSource,
  setPartnershipDataSource,
} from "@/services/campaign-partnership.service";

const TOKEN = "test-admin-key";

function reviewRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://test/api/ngos/ngo-1", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/ngos/[id]", () => {
  beforeEach(() => {
    setPartnershipDataSource(new InMemoryPartnershipDataSource());
  });
  afterEach(() => {
    delete process.env.ADMIN_API_KEY;
  });

  it("returns a single NGO profile", async () => {
    const response = await GET(new Request("http://test/api/ngos/ngo-1"), {
      params: Promise.resolve({ id: "ngo-1" }),
    });
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ id: "ngo-1", name: "Global Tree Planters" });
  });

  it("returns 404 for an unknown NGO", async () => {
    const response = await GET(new Request("http://test/api/ngos/ngo-missing"), {
      params: Promise.resolve({ id: "ngo-missing" }),
    });
    expect(response.status).toBe(404);
  });

  it("fails closed with 503 when no admin key is configured", async () => {
    const response = await PATCH(reviewRequest({ verdict: "VERIFIED" }), {
      params: Promise.resolve({ id: "ngo-1" }),
    });
    expect(response.status).toBe(503);
  });

  it("rejects unauthorized reviews with 401", async () => {
    process.env.ADMIN_API_KEY = TOKEN;
    const missing = await PATCH(reviewRequest({ verdict: "VERIFIED" }), {
      params: Promise.resolve({ id: "ngo-1" }),
    });
    expect(missing.status).toBe(401);

    const wrong = await PATCH(reviewRequest({ verdict: "VERIFIED" }, { authorization: "Bearer nope" }), {
      params: Promise.resolve({ id: "ngo-1" }),
    });
    expect(wrong.status).toBe(401);
  });

  it("verifies a pending NGO with the admin token", async () => {
    process.env.ADMIN_API_KEY = TOKEN;
    const response = await PATCH(
      reviewRequest({ verdict: "VERIFIED", reviewer: "ops-bot" }, { authorization: `Bearer ${TOKEN}` }),
      { params: Promise.resolve({ id: "ngo-3" }) },
    );
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toMatchObject({ id: "ngo-3", verificationStatus: "VERIFIED", isVerified: true, reviewedBy: "ops-bot" });
  });

  it("rejects an invalid verdict", async () => {
    process.env.ADMIN_API_KEY = TOKEN;
    const response = await PATCH(
      reviewRequest({ verdict: "PENDING" }, { authorization: `Bearer ${TOKEN}` }),
      { params: Promise.resolve({ id: "ngo-1" }) },
    );
    expect(response.status).toBe(400);
  });
});