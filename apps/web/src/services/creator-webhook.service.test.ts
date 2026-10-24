import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { createHmac } from "crypto";
import { WebhookService } from "./webhook.service";
import { CreatorWebhookService, maskSecret } from "./creator-webhook.service";

const testDir = path.join(process.cwd(), "data", "test-creator-webhooks");

describe("CreatorWebhookService", () => {
  let webhooks: WebhookService;
  let svc: CreatorWebhookService;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    webhooks = new WebhookService({
      maxRetries: 3,
      baseDelay: 50,
      subscriptionsPath: path.join(testDir, "subscriptions.json"),
      deadLetterPath: path.join(testDir, "dead_letter.json"),
      deduplicationPath: path.join(testDir, "delivered.json"),
    });
    svc = new CreatorWebhookService(webhooks);
    mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = mockFetch;
  });

  afterEach(async () => {
    await svc.awaitPendingDeliveries();
    await fs.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("configuration", () => {
    it("creates an endpoint with a generated secret that is only revealed once", async () => {
      const { config, secret } = await svc.saveConfig("GCREATOR", { url: "https://hooks.example.com/fundable" });
      expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
      expect(config).toMatchObject({
        url: "https://hooks.example.com/fundable",
        events: ["pledge.created", "campaign.milestone_reached", "campaign.ended", "refund.requested"],
        enabled: true,
        secretPreview: maskSecret(secret!),
      });
      expect(JSON.stringify(await svc.getConfig("GCREATOR"))).not.toContain(secret);
    });

    it("updates without changing the secret unless asked to rotate", async () => {
      const { secret } = await svc.saveConfig("GCREATOR", { url: "https://a.example.com/hook", secret: "my-own-secret-123456" });
      expect(secret).toBe("my-own-secret-123456");

      const updated = await svc.saveConfig("GCREATOR", { events: ["pledge.created"], enabled: false });
      expect(updated.secret).toBeUndefined();
      expect(updated.config).toMatchObject({ events: ["pledge.created"], enabled: false, url: "https://a.example.com/hook" });

      const rotated = await svc.saveConfig("GCREATOR", { rotateSecret: true });
      expect(rotated.secret).toMatch(/^whsec_/);
      expect(rotated.secret).not.toBe("my-own-secret-123456");
    });

    it("validates url, events and secret", async () => {
      await expect(svc.saveConfig("GCREATOR", { url: "ftp://x.example.com" })).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(svc.saveConfig("GCREATOR", { url: "http://example.com/hook" })).rejects.toThrow("https");
      await expect(svc.saveConfig("GCREATOR", { url: "https://x.example.com", events: ["stream.status_updated"] })).rejects.toThrow("Unsupported events");
      await expect(svc.saveConfig("GCREATOR", { url: "https://x.example.com", events: [] })).rejects.toMatchObject({ code: "INVALID_INPUT" });
      await expect(svc.saveConfig("GCREATOR", { url: "https://x.example.com", secret: "short" })).rejects.toThrow("at least 16");
    });

    it("deletes the endpoint", async () => {
      await svc.saveConfig("GCREATOR", { url: "https://x.example.com/hook" });
      expect(await svc.deleteConfig("GCREATOR")).toBe(true);
      expect(await svc.getConfig("GCREATOR")).toBeNull();
      expect(await svc.deleteConfig("GCREATOR")).toBe(false);
    });
  });

  describe("delivery", () => {
    it("POSTs a signed payload only to the matching creator's endpoint", async () => {
      const { secret } = await svc.saveConfig("GCREATOR", { url: "https://creator.example.com/hook" });
      await svc.saveConfig("GOTHER", { url: "https://other.example.com/hook" });

      await svc.notify("gcreator", "pledge.created", { eventId: "c1:pledge:p1", campaignId: "c1", amount: "100" });
      await svc.awaitPendingDeliveries();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("https://creator.example.com/hook");
      expect(init.method).toBe("POST");
      expect(init.headers["X-Webhook-Event"]).toBe("pledge.created");
      const expected = createHmac("sha256", secret!)
        .update(`${init.headers["X-Webhook-Timestamp"]}.${init.body}`)
        .digest("hex");
      expect(init.headers["X-Webhook-Signature"]).toBe(expected);
      expect(JSON.parse(init.body).payload).toMatchObject({ campaignId: "c1", amount: "100", creatorId: "gcreator" });
    });

    it("respects event selection and the enabled flag", async () => {
      await svc.saveConfig("GCREATOR", { url: "https://creator.example.com/hook", events: ["campaign.ended"] });
      await svc.notify("GCREATOR", "pledge.created", { eventId: "e1", campaignId: "c1" });
      await svc.awaitPendingDeliveries();
      expect(mockFetch).not.toHaveBeenCalled();

      await svc.saveConfig("GCREATOR", { enabled: false });
      await svc.notify("GCREATOR", "campaign.ended", { eventId: "e2", campaignId: "c1" });
      await svc.awaitPendingDeliveries();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("sends test events regardless of event selection", async () => {
      await svc.saveConfig("GCREATOR", { url: "https://creator.example.com/hook", events: ["refund.requested"] });
      await svc.sendTestEvent("GCREATOR");
      await svc.awaitPendingDeliveries();
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][1].headers["X-Webhook-Event"]).toBe("webhook.test");
    });

    it("requires a configured endpoint for test events", async () => {
      await expect(svc.sendTestEvent("GNOBODY")).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
    });
  });

  describe("event log", () => {
    it("records successful deliveries newest first, scoped to the creator", async () => {
      await svc.saveConfig("GCREATOR", { url: "https://creator.example.com/hook" });
      await svc.saveConfig("GOTHER", { url: "https://other.example.com/hook" });
      await svc.notify("GCREATOR", "pledge.created", { eventId: "a", campaignId: "c1" });
      await svc.awaitPendingDeliveries();
      await svc.notify("GCREATOR", "campaign.ended", { eventId: "b", campaignId: "c1" });
      await svc.notify("GOTHER", "campaign.ended", { eventId: "c", campaignId: "c2" });
      await svc.awaitPendingDeliveries();

      const log = await svc.getEventLog("GCREATOR");
      expect(log.map((entry) => entry.event)).toEqual(["campaign.ended", "pledge.created"]);
      expect(log.every((entry) => entry.success && entry.creatorId === "GCREATOR")).toBe(true);
    });

    it("logs each retry with exponential back-off, then the final failure", async () => {
      vi.useFakeTimers();
      mockFetch.mockResolvedValue({ ok: false, status: 503 });
      await svc.saveConfig("GCREATOR", { url: "https://creator.example.com/hook" });

      await svc.notify("GCREATOR", "refund.requested", { eventId: "r1", campaignId: "c1" });
      expect(mockFetch).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(50);
      expect(mockFetch).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(100);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1000);
      expect(mockFetch).toHaveBeenCalledTimes(3);
      vi.useRealTimers();
      await svc.awaitPendingDeliveries();

      const log = await svc.getEventLog("GCREATOR");
      expect(log.map((entry) => entry.attempt)).toEqual([3, 2, 1]);
      expect(log[0]).toMatchObject({ success: false, statusCode: 503, nextRetryAt: null, maxAttempts: 3 });
      expect(log[1].nextRetryAt).toEqual(expect.any(String));
      expect(log[2].nextRetryAt).toEqual(expect.any(String));
    });
  });
});
