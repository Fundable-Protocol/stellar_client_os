import { beforeEach, describe, expect, it } from "vitest";
import { POST as tokenPost } from "./oauth/token/route";
import { GET as authorizeGet } from "./oauth/authorize/route";
import { GET as campaignsGet } from "./campaigns/route";
import { GET as campaignByIdGet } from "./campaigns/[id]/route";
import { GET as widgetGet } from "./campaigns/[id]/widget/route";
import { GET as webhooksGet, POST as webhooksPost, DELETE as webhooksDelete } from "./webhooks/route";
import { POST as webhooksTestPost } from "./webhooks/test/route";
import { GET as quotaGet } from "./quota/route";
import { POST as sandboxResetPost } from "./sandbox/reset/route";
import {
  DEFAULT_SANDBOX_CLIENT,
  resetPublicApiStateForTests,
} from "@/services/public-api.service";

async function getSandboxBearerToken(scope = "campaigns:read widgets:embed webhooks:manage"): Promise<string> {
  const res = await tokenPost(
    new Request("https://fundable.network/api/v1/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: DEFAULT_SANDBOX_CLIENT.clientId,
        client_secret: DEFAULT_SANDBOX_CLIENT.clientSecret,
        scope,
      }),
    }),
  );
  const body = await res.json();
  return body.access_token as string;
}

describe("Public API v1 Routes (/api/v1/*)", () => {
  beforeEach(() => {
    resetPublicApiStateForTests();
  });

  it("rejects unauthenticated requests to /api/v1/campaigns with 401 and WWW-Authenticate header", async () => {
    const res = await campaignsGet(new Request("https://fundable.network/api/v1/campaigns"));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toContain("Bearer");
  });

  it("exchanges OAuth2 authorization code for Bearer token and reads sandbox campaigns", async () => {
    const authRes = await authorizeGet(
      new Request(
        `https://fundable.network/api/v1/oauth/authorize?response_type=code&client_id=${DEFAULT_SANDBOX_CLIENT.clientId}&state=xyz123`,
      ),
    );
    expect(authRes.status).toBe(200);
    const authBody = await authRes.json();
    expect(authBody.code).toMatch(/^fnd_code_sandbox_/);
    expect(authBody.state).toBe("xyz123");

    const tokenRes = await tokenPost(
      new Request("https://fundable.network/api/v1/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: DEFAULT_SANDBOX_CLIENT.clientId,
          client_secret: DEFAULT_SANDBOX_CLIENT.clientSecret,
          code: authBody.code,
        }),
      }),
    );
    expect(tokenRes.status).toBe(200);
    const { access_token } = await tokenRes.json();

    const listRes = await campaignsGet(
      new Request("https://fundable.network/api/v1/campaigns", {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
    );
    expect(listRes.status).toBe(200);
    expect(listRes.headers.get("RateLimit-Limit")).toBe("1000");
    expect(listRes.headers.get("X-Quota-Limit")).toBe("25000");
    const listBody = await listRes.json();
    expect(listBody.data.length).toBeGreaterThanOrEqual(3);
    expect(listBody.meta.environment).toBe("sandbox");
  });

  it("returns single campaign data and embeddable widget in JSON and HTML formats", async () => {
    const token = await getSandboxBearerToken();

    const detailRes = await campaignByIdGet(
      new Request("https://fundable.network/api/v1/campaigns/sbx-camp-amazon-01", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ id: "sbx-camp-amazon-01" }) },
    );
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json();
    expect(detailBody.data.id).toBe("sbx-camp-amazon-01");

    const widgetJsonRes = await widgetGet(
      new Request("https://fundable.network/api/v1/campaigns/sbx-camp-amazon-01/widget?theme=forest", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      { params: Promise.resolve({ id: "sbx-camp-amazon-01" }) },
    );
    expect(widgetJsonRes.status).toBe(200);
    const widgetJson = await widgetJsonRes.json();
    expect(widgetJson.data.iframeSnippet).toContain("<iframe");

    const widgetHtmlRes = await widgetGet(
      new Request(
        "https://fundable.network/api/v1/campaigns/sbx-camp-amazon-01/widget?format=html&theme=dark",
      ),
      { params: Promise.resolve({ id: "sbx-camp-amazon-01" }) },
    );
    expect(widgetHtmlRes.status).toBe(200);
    expect(widgetHtmlRes.headers.get("Content-Type")).toContain("text/html");
    expect(await widgetHtmlRes.text()).toContain("Amazon Basin Canopy Restoration");
  });

  it("manages third-party webhooks, dispatches signed sandbox test events, and inspects quota", async () => {
    const token = await getSandboxBearerToken();

    const createRes = await webhooksPost(
      new Request("https://fundable.network/api/v1/webhooks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          url: "https://partner.example.com/webhooks/fundable",
          events: ["campaign.milestone_reached", "tree_verified"],
        }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createdSub = (await createRes.json()).data;

    const testRes = await webhooksTestPost(
      new Request("https://fundable.network/api/v1/webhooks/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event: "campaign.milestone_reached",
          campaignId: "sbx-camp-amazon-01",
          subscriptionId: createdSub.id,
        }),
      }),
    );
    expect(testRes.status).toBe(200);
    const testBody = await testRes.json();
    expect(testBody.dispatchedHeaders["X-Fundable-Signature"]).toMatch(/^sha256=/);

    const listRes = await webhooksGet(
      new Request("https://fundable.network/api/v1/webhooks", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const listBody = await listRes.json();
    expect(listBody.data).toHaveLength(1);
    expect(listBody.deliveries).toHaveLength(1);

    const delRes = await webhooksDelete(
      new Request(`https://fundable.network/api/v1/webhooks?id=${createdSub.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(delRes.status).toBe(200);

    const quotaRes = await quotaGet(
      new Request("https://fundable.network/api/v1/quota", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    expect(quotaRes.status).toBe(200);
    const quotaBody = await quotaRes.json();
    expect(quotaBody.data.hourly.used).toBeGreaterThanOrEqual(4);

    const resetRes = await sandboxResetPost();
    expect(resetRes.status).toBe(200);
  });
});
