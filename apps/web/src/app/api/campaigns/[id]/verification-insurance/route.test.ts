import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";

const CAMPAIGN = "route-insured-camp";
const SPONSOR = "GD6BXVRVMEPHHXNZYVCI6HIJIB4OOGEFMVZ6OD2EWE37WCTMOVOCNJUW";
const TOKEN = "test-oracle-token";
const URL = `http://test/api/campaigns/${CAMPAIGN}/verification-insurance`;
const params = { params: Promise.resolve({ id: CAMPAIGN }) };

function post(body: unknown, headers: Record<string, string> = {}) {
  return new Request(URL, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("/api/campaigns/:id/verification-insurance", () => {
  beforeEach(() => {
    process.env.VERIFICATION_INSURANCE_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.VERIFICATION_INSURANCE_ADMIN_TOKEN;
  });

  it("quotes, binds and settles a policy", async () => {
    const quoted = await POST(
      post({
        action: "quote",
        co2TargetTonnes: 50,
        coverageAmount: "2000",
        verificationStandard: "gold_standard",
        verificationWindowDays: 180,
      }),
      params,
    );
    expect(quoted.status).toBe(200);
    const { data: quotes } = await quoted.json();
    expect(quotes[0]).toMatchObject({ underwriterId: "terra-assure", premium: "80", asset: "USDC" });

    const bound = await POST(post({ action: "bind", quoteId: quotes[0].id, sponsorAddress: SPONSOR }), params);
    expect(bound.status).toBe(201);
    const { data: policy } = await bound.json();

    const listed = await GET(new Request(`${URL}?sponsorAddress=${SPONSOR}`), params);
    const { data } = await listed.json();
    expect(data.underwriters.length).toBeGreaterThan(0);
    expect(data.policies.map((p: { id: string }) => p.id)).toContain(policy.id);

    const settle = { action: "settle", policyId: policy.id, verifiedCo2Tonnes: 55 };
    expect((await POST(post(settle), params)).status).toBe(401);

    const settled = await POST(post(settle, { authorization: `Bearer ${TOKEN}` }), params);
    expect(settled.status).toBe(200);
    expect((await settled.json()).data).toMatchObject({ status: "fulfilled" });
  });

  it("rejects invalid payloads and maps service errors", async () => {
    expect((await POST(post({ action: "bind", quoteId: "q", sponsorAddress: "nope" }), params)).status).toBe(400);
    expect((await POST(post({ action: "unknown" }), params)).status).toBe(400);

    const missing = await POST(post({ action: "bind", quoteId: "missing", sponsorAddress: SPONSOR }), params);
    expect(missing.status).toBe(404);
    expect((await missing.json()).code).toBe("QUOTE_NOT_FOUND");

    const declined = await POST(
      post({
        action: "quote",
        co2TargetTonnes: 50,
        coverageAmount: "99999999",
        verificationStandard: "verra_vcs",
        verificationWindowDays: 180,
      }),
      params,
    );
    expect(declined.status).toBe(422);
  });
});
