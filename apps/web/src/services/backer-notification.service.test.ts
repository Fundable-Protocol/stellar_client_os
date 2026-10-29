import { describe, it, expect, beforeEach } from "vitest";
import {
  BackerNotificationService,
  InMemoryBackerNotificationPreferencesDataSource,
} from "./backer-notification.service";
import { DEFAULT_EVENT_PREFERENCES } from "@/types/backer-notification-preferences";

describe("BackerNotificationService", () => {
  let service: BackerNotificationService;
  let dataSource: InMemoryBackerNotificationPreferencesDataSource;

  beforeEach(() => {
    dataSource = new InMemoryBackerNotificationPreferencesDataSource();
    service = new BackerNotificationService(dataSource);
  });

  describe("getPreferences", () => {
    it("returns default preferences if none stored", async () => {
      const prefs = await service.getPreferences("GBACKER1", "camp-101", "Rainforest Reforestation");
      expect(prefs.backerAddress).toBe("GBACKER1");
      expect(prefs.campaignId).toBe("camp-101");
      expect(prefs.campaignTitle).toBe("Rainforest Reforestation");
      expect(prefs.preferences.updates).toEqual(DEFAULT_EVENT_PREFERENCES.updates);
      expect(prefs.preferences.milestones).toEqual(DEFAULT_EVENT_PREFERENCES.milestones);
      expect(prefs.preferences.end_of_campaign).toEqual(DEFAULT_EVENT_PREFERENCES.end_of_campaign);
      expect(prefs.preferences.reward_shipped).toEqual(DEFAULT_EVENT_PREFERENCES.reward_shipped);
    });

    it("throws if backerAddress or campaignId missing", async () => {
      await expect(service.getPreferences("", "camp-1")).rejects.toThrow();
      await expect(service.getPreferences("GBACKER1", "")).rejects.toThrow();
    });
  });

  describe("updateCampaignPreference", () => {
    it("updates specific event and channel toggles", async () => {
      const updated = await service.updateCampaignPreference({
        backerAddress: "GBACKER1",
        campaignId: "camp-101",
        campaignTitle: "Rainforest Reforestation",
        preferences: {
          updates: { email: false, in_app: true, push: true },
          reward_shipped: { push: true, email: true },
        },
        email: "backer@example.com",
      });

      expect(updated.preferences.updates.email).toBe(false);
      expect(updated.preferences.updates.push).toBe(true);
      expect(updated.preferences.updates.in_app).toBe(true);
      expect(updated.email).toBe("backer@example.com");

      // Verify retrieval
      const fetched = await service.getPreferences("GBACKER1", "camp-101");
      expect(fetched.preferences.updates.email).toBe(false);
      expect(fetched.preferences.updates.push).toBe(true);
    });
  });

  describe("bulkUpdatePreferences", () => {
    it("applies changes across all backed campaigns", async () => {
      const backedCampaigns = [
        { campaignId: "camp-1", campaignTitle: "Clean Oceans" },
        { campaignId: "camp-2", campaignTitle: "Solar Energy" },
      ];

      const bulkResults = await service.bulkUpdatePreferences(
        {
          backerAddress: "GBACKER1",
          preferences: {
            reward_shipped: { email: true, in_app: true, push: true },
            end_of_campaign: { push: false },
          },
          email: "bulk@example.com",
        },
        backedCampaigns
      );

      expect(bulkResults.length).toBe(2);
      expect(bulkResults[0].preferences.reward_shipped.push).toBe(true);
      expect(bulkResults[0].preferences.end_of_campaign.push).toBe(false);
      expect(bulkResults[1].preferences.reward_shipped.push).toBe(true);
      expect(bulkResults[1].preferences.end_of_campaign.push).toBe(false);

      const pref2 = await service.getPreferences("GBACKER1", "camp-2");
      expect(pref2.preferences.reward_shipped.push).toBe(true);
      expect(pref2.preferences.end_of_campaign.push).toBe(false);
    });

    it("applies to targeted campaignIds subset if provided", async () => {
      const backedCampaigns = [
        { campaignId: "camp-1", campaignTitle: "Clean Oceans" },
        { campaignId: "camp-2", campaignTitle: "Solar Energy" },
      ];

      const bulkResults = await service.bulkUpdatePreferences(
        {
          backerAddress: "GBACKER1",
          campaignIds: ["camp-2"],
          preferences: {
            updates: { push: true },
          },
        },
        backedCampaigns
      );

      expect(bulkResults.length).toBe(1);
      expect(bulkResults[0].campaignId).toBe("camp-2");
      expect(bulkResults[0].preferences.updates.push).toBe(true);
    });
  });

  describe("shouldDeliver", () => {
    it("returns correct boolean according to configuration", async () => {
      await service.updateCampaignPreference({
        backerAddress: "GBACKER1",
        campaignId: "camp-101",
        preferences: {
          updates: { email: false, push: true, in_app: false },
        },
      });

      const emailCheck = await service.shouldDeliver({
        backerAddress: "GBACKER1",
        campaignId: "camp-101",
        event: "updates",
        channel: "email",
      });
      expect(emailCheck).toBe(false);

      const pushCheck = await service.shouldDeliver({
        backerAddress: "GBACKER1",
        campaignId: "camp-101",
        event: "updates",
        channel: "push",
      });
      expect(pushCheck).toBe(true);

      const inAppCheck = await service.shouldDeliver({
        backerAddress: "GBACKER1",
        campaignId: "camp-101",
        event: "updates",
        channel: "in_app",
      });
      expect(inAppCheck).toBe(false);
    });
  });
});
