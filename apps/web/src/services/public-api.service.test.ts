import { beforeEach, describe, expect, it } from "vitest";
import {
  authenticatePublicApiRequest,
  buildPublicWidgetEmbedDto,
  computePublicWebhookSignature,
  consumePublicApiQuota,
  DEFAULT_SANDBOX_CLIENT,
  deletePublicWebhookSubscription,
  getPublicApiQuotaStatus,
  getPublicCampaignById,
  issueAuthorizationCode,
  issueOAuth2Token,
  listOAuth2Clients,
  listPublicCampaigns,
  listPublicWebhookSubscriptions,
  registerOAuth2Client,
  registerPublicWebhookSubscription,
  renderPublicWidgetHtml,
  resetPublicApiSandbox,
  resetPublicApiStateForTests,
  triggerSandboxWebhookEvent,
} from "./public-api.service";

describe("public-api.service", () => {
  beforeEach(() => {
    resetPublicApiStateForTests();
  });

  describe("OAuth2 authentication & grant flows", () => {
    it("issues a Bearer token via client_credentials grant and authenticates requests", () => {
      const tokenRes = issueOAuth2Token({
        grantType: "client_credentials",
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        clientSecret: DEFAULT_SANDBOX_CLIENT.clientSecret,
        scope: "campaigns:read widgets:embed",
      });

      expect(tokenRes.token_type).toBe("Bearer");
      expect(tokenRes.access_token).toMatch(/^fnd_at_sbx_/);
      expect(tokenRes.environment).toBe("sandbox");
      expect(tokenRes.scope).toBe("campaigns:read widgets:embed");

      const req = new Request("https://fundable.network/api/v1/campaigns", {
        headers: { Authorization: `Bearer ${tokenRes.access_token}` },
      });

      const authRead = authenticatePublicApiRequest(req, "campaigns:read");
      expect(authRead.ok).toBe(true);

      const authWebhooks = authenticatePublicApiRequest(req, "webhooks:manage");
      expect(authWebhooks.ok).toBe(false);
      if (!authWebhooks.ok) {
        expect(authWebhooks.status).toBe(403);
        expect(authWebhooks.error).toBe("insufficient_scope");
      }
    });

    it("supports authorization_code and refresh_token grant flows", () => {
      const codeRecord = issueAuthorizationCode({
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        redirectUri: DEFAULT_SANDBOX_CLIENT.redirectUris[0],
        scope: "campaigns:read",
      });

      const tokenRes = issueOAuth2Token({
        grantType: "authorization_code",
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        clientSecret: DEFAULT_SANDBOX_CLIENT.clientSecret,
        code: codeRecord.code,
        redirectUri: DEFAULT_SANDBOX_CLIENT.redirectUris[0],
      });

      expect(tokenRes.access_token).toMatch(/^fnd_at_sbx_/);
      expect(tokenRes.scope).toBe("campaigns:read");

      // Re-using the same authorization code must fail
      expect(() =>
        issueOAuth2Token({
          grantType: "authorization_code",
          clientId: DEFAULT_SANDBOX_CLIENT.clientId,
          clientSecret: DEFAULT_SANDBOX_CLIENT.clientSecret,
          code: codeRecord.code,
        }),
      ).toThrow(/already been used/);

      // Refresh token rotation
      const refreshed = issueOAuth2Token({
        grantType: "refresh_token",
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        clientSecret: DEFAULT_SANDBOX_CLIENT.clientSecret,
        refreshToken: tokenRes.refresh_token,
      });

      expect(refreshed.access_token).not.toBe(tokenRes.access_token);
    });

    it("registers custom OAuth2 clients and enforces tier quota limits", () => {
      const client = registerOAuth2Client({
        name: "EcoTracker Widget Partner",
        environment: "sandbox",
        tier: "free",
        scopes: ["campaigns:read", "widgets:embed"],
      });

      expect(client.clientId).toMatch(/^fnd_sbx_client_/);
      expect(listOAuth2Clients("sandbox").some((c) => c.clientId === client.clientId)).toBe(true);
    });
  });

  describe("Rate limiting & clear quota tracking", () => {
    it("tracks hourly and daily quota usage and returns standard headers", () => {
      const client = registerOAuth2Client({
        name: "Quota Test App",
        environment: "sandbox",
        tier: "free",
      });

      const first = consumePublicApiQuota(client.clientId, 1_000_000);
      expect(first.allowed).toBe(true);
      expect(first.quota.hourly.used).toBe(1);
      expect(first.quota.hourly.limit).toBe(100);
      expect(first.quota.hourly.remaining).toBe(99);
      expect(first.headers["RateLimit-Limit"]).toBe("100");
      expect(first.headers["RateLimit-Remaining"]).toBe("99");
      expect(first.headers["X-Quota-Limit"]).toBe("1000");
      expect(first.headers["X-Quota-Used"]).toBe("1");

      const status = getPublicApiQuotaStatus(client.clientId, 1_000_500);
      expect(status.hourly.used).toBe(1);
    });

    it("throttles requests when hourly quota is exhausted", () => {
      const client = registerOAuth2Client({
        name: "Burst Test App",
        environment: "sandbox",
        tier: "free",
      });

      const baseNow = 5_000_000;
      for (let i = 0; i < 100; i++) {
        const res = consumePublicApiQuota(client.clientId, baseNow + i);
        expect(res.allowed).toBe(true);
      }

      const blocked = consumePublicApiQuota(client.clientId, baseNow + 200);
      expect(blocked.allowed).toBe(false);
      expect(blocked.quota.isThrottled).toBe(true);
      expect(blocked.headers["Retry-After"]).toBeDefined();
    });
  });

  describe("Sandbox campaigns, widgets, and webhooks", () => {
    it("lists and filters isolated sandbox campaigns", async () => {
      const all = await listPublicCampaigns({ environment: "sandbox" });
      expect(all.data.length).toBeGreaterThanOrEqual(3);

      const filtered = await listPublicCampaigns({
        environment: "sandbox",
        search: "Mangrove",
      });
      expect(filtered.data).toHaveLength(1);
      expect(filtered.data[0].id).toBe("sbx-camp-mangrove-02");
    });

    it("builds embeddable widget DTO and HTML with sandbox badge", async () => {
      const found = await getPublicCampaignById("sbx-camp-amazon-01", "sandbox");
      expect(found).not.toBeNull();

      const widgetDto = buildPublicWidgetEmbedDto(found!.record, {
        baseUrl: "https://fundable.network",
        theme: "forest",
        environment: "sandbox",
      });
      expect(widgetDto.iframeSnippet).toContain("<iframe");
      expect(widgetDto.metrics.progressPercent).toBe(69);

      const html = renderPublicWidgetHtml(found!.record, "forest", "sandbox");
      expect(html).toContain("SANDBOX");
      expect(html).toContain("Amazon Basin Canopy Restoration");
    });

    it("registers webhooks, computes HMAC-SHA256 signatures, and resets sandbox state", () => {
      const sub = registerPublicWebhookSubscription({
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        environment: "sandbox",
        url: "https://partner.example.com/webhook",
        events: ["campaign.milestone_reached", "tree_verified"],
        secret: "super_secret_signing_key_123",
      });

      expect(sub.id).toMatch(/^whsub_/);
      expect(
        listPublicWebhookSubscriptions(DEFAULT_SANDBOX_CLIENT.clientId, "sandbox"),
      ).toHaveLength(1);

      const dispatched = triggerSandboxWebhookEvent({
        clientId: DEFAULT_SANDBOX_CLIENT.clientId,
        environment: "sandbox",
        event: "campaign.milestone_reached",
        campaignId: "sbx-camp-amazon-01",
      });

      const expectedSig = computePublicWebhookSignature(
        dispatched.delivery.timestamp,
        JSON.stringify(dispatched.delivery.payload),
        "super_secret_signing_key_123",
      );
      expect(dispatched.delivery.signature).toBe(expectedSig);
      expect(dispatched.headers["X-Fundable-Signature"]).toBe(expectedSig);

      const deleted = deletePublicWebhookSubscription(
        sub.id,
        DEFAULT_SANDBOX_CLIENT.clientId,
      );
      expect(deleted).toBe(true);

      const resetSummary = resetPublicApiSandbox();
      expect(resetSummary.sandboxCampaignCount).toBe(3);
    });
  });
});
