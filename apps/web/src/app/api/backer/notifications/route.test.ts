import { describe, it, expect, beforeEach } from "vitest";
import { GET, POST } from "./route";
import { POST as POST_BULK } from "../bulk/route";
import { setBackerNotificationDataSource, InMemoryBackerNotificationPreferencesDataSource } from "@/services/backer-notification.service";
import { NextRequest } from "next/server";

describe("Backer Notifications API Routes", () => {
  beforeEach(() => {
    setBackerNotificationDataSource(new InMemoryBackerNotificationPreferencesDataSource());
  });

  describe("GET /api/backer/notifications", () => {
    it("returns 400 if backerAddress is missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/backer/notifications");
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain("backerAddress");
    });

    it("returns default preferences for single campaign when query specified", async () => {
      const req = new NextRequest("http://localhost:3000/api/backer/notifications?backerAddress=GBACKER123&campaignId=camp-101");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.backerAddress).toBe("GBACKER123");
      expect(json.campaignId).toBe("camp-101");
      expect(json.preferences.updates).toBeDefined();
    });
  });

  describe("POST /api/backer/notifications", () => {
    it("updates campaign preferences for a backer", async () => {
      const req = new NextRequest("http://localhost:3000/api/backer/notifications", {
        method: "POST",
        body: JSON.stringify({
          backerAddress: "GBACKER123",
          campaignId: "camp-101",
          campaignTitle: "Reforest Amazon",
          preferences: {
            reward_shipped: { push: true, email: true, in_app: false },
          },
          email: "backer@fundable.test",
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.preferences.reward_shipped.push).toBe(true);
      expect(json.preferences.reward_shipped.in_app).toBe(false);
      expect(json.email).toBe("backer@fundable.test");
    });
  });

  describe("POST /api/backer/notifications/bulk", () => {
    it("updates preferences across multiple backed campaigns", async () => {
      const req = new NextRequest("http://localhost:3000/api/backer/notifications/bulk", {
        method: "POST",
        body: JSON.stringify({
          backerAddress: "GBACKER123",
          backedCampaigns: [
            { campaignId: "camp-1", campaignTitle: "Campaign One" },
            { campaignId: "camp-2", campaignTitle: "Campaign Two" },
          ],
          preferences: {
            end_of_campaign: { push: true, email: true, in_app: true },
          },
        }),
      });

      const res = await POST_BULK(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.count).toBe(2);
      expect(json.preferences[0].preferences.end_of_campaign.push).toBe(true);
      expect(json.preferences[1].preferences.end_of_campaign.push).toBe(true);
    });
  });
});
