import { beforeEach, describe, expect, it } from "vitest";
import {
  buildMultiPlatformPreviews,
  buildPostPreview,
  cancelScheduledPost,
  connectSocialAccount,
  disconnectSocialAccount,
  getCalendarMonthGrid,
  getCreatorSocialSettings,
  groupScheduledPostsByDate,
  listScheduledPosts,
  normalizeHashtags,
  rescheduleSocialPost,
  resetSocialSchedulerStore,
  scheduleSocialPost,
  updateCreatorSocialSettings,
} from "./campaign-social-scheduler.service";

const CREATOR = "GD6W...X892";
const CAMPAIGN_ID = "camp-101";
const CAMPAIGN_TITLE = "Save the Amazon RainForest Reserve";
const NOW = new Date("2026-10-17T12:00:00.000Z");

describe("campaign-social-scheduler.service (Issue #1266)", () => {
  beforeEach(() => {
    resetSocialSchedulerStore();
  });

  describe("Creator Settings: Social Media Account Connections", () => {
    it("returns default disconnected accounts for Twitter/X, Facebook, and LinkedIn", () => {
      const settings = getCreatorSocialSettings(CREATOR);
      expect(settings.creatorAddress).toBe(CREATOR);
      expect(settings.accounts.twitter.connected).toBe(false);
      expect(settings.accounts.facebook.connected).toBe(false);
      expect(settings.accounts.linkedin.connected).toBe(false);
      expect(settings.defaultHashtags).toContain("#Fundable");
    });

    it("connects and disconnects Twitter/X, Facebook, and LinkedIn accounts", () => {
      const afterTwitter = connectSocialAccount(
        CREATOR,
        { platform: "twitter", handle: "amazon_reserve", displayName: "Amazon Reserve" },
        undefined,
        NOW,
      );
      expect(afterTwitter.accounts.twitter.connected).toBe(true);
      expect(afterTwitter.accounts.twitter.handle).toBe("@amazon_reserve");
      expect(afterTwitter.accounts.twitter.displayName).toBe("Amazon Reserve");

      const afterFacebook = connectSocialAccount(
        CREATOR,
        { platform: "facebook", handle: "facebook.com/amazonreserve" },
        undefined,
        NOW,
      );
      expect(afterFacebook.accounts.facebook.connected).toBe(true);
      expect(afterFacebook.accounts.facebook.handle).toBe("facebook.com/amazonreserve");

      const afterLinkedIn = connectSocialAccount(
        CREATOR,
        { platform: "linkedin", handle: "company/amazon-reserve" },
        undefined,
        NOW,
      );
      expect(afterLinkedIn.accounts.linkedin.connected).toBe(true);

      const afterDisconnect = disconnectSocialAccount(CREATOR, "twitter", undefined, NOW);
      expect(afterDisconnect.accounts.twitter.connected).toBe(false);
      expect(afterDisconnect.accounts.twitter.handle).toBe("");
      expect(afterDisconnect.accounts.facebook.connected).toBe(true);
      expect(afterDisconnect.accounts.linkedin.connected).toBe(true);
    });

    it("updates default hashtags and timezone in creator settings", () => {
      const updated = updateCreatorSocialSettings(
        CREATOR,
        {
          defaultHashtags: "Amazon, Stellar, #Reforestation",
          timezone: "America/Sao_Paulo",
        },
        undefined,
        NOW,
      );

      expect(updated.defaultHashtags).toEqual(["#Amazon", "#Stellar", "#Reforestation"]);
      expect(updated.timezone).toBe("America/Sao_Paulo");
    });

    it("normalizes and deduplicates hashtags", () => {
      expect(normalizeHashtags(["#Stellar", "stellar", "  ClimateAction  ", ""])).toEqual([
        "#Stellar",
        "#ClimateAction",
      ]);
    });
  });

  describe("Post Preview Before Scheduling", () => {
    it("builds a platform-specific preview with character count and connected handle", () => {
      const settings = connectSocialAccount(
        CREATOR,
        { platform: "twitter", handle: "@fundable_trees", displayName: "Fundable Trees" },
        undefined,
        NOW,
      );

      const preview = buildPostPreview({
        platform: "twitter",
        content: "We just planted 1,500 native trees in the Amazon Basin!",
        hashtags: ["Reforestation", "Stellar"],
        campaignTitle: CAMPAIGN_TITLE,
        campaignUrl: "https://fundable.protocol/campaigns/camp-101",
        scheduledFor: "2026-10-20T15:00:00.000Z",
        account: settings.accounts.twitter,
      });

      expect(preview.platformLabel).toBe("Twitter / X");
      expect(preview.connected).toBe(true);
      expect(preview.handle).toBe("@fundable_trees");
      expect(preview.displayName).toBe("Fundable Trees");
      expect(preview.hashtagsText).toBe("#Reforestation #Stellar");
      expect(preview.formattedBody).toContain("We just planted 1,500 native trees");
      expect(preview.formattedBody).toContain("#Reforestation #Stellar");
      expect(preview.formattedBody).toContain("https://fundable.protocol/campaigns/camp-101");
      expect(preview.maxChars).toBe(280);
      expect(preview.isOverLimit).toBe(false);
    });

    it("flags Twitter/X previews that exceed the 280-character limit while LinkedIn stays valid", () => {
      const longCopy = "A".repeat(260);
      const previews = buildMultiPlatformPreviews({
        platforms: ["twitter", "linkedin"],
        content: longCopy,
        hashtags: ["ClimateAction"],
        campaignTitle: CAMPAIGN_TITLE,
        campaignUrl: "https://fundable.protocol/campaigns/camp-101",
      });

      const twitterPreview = previews.find((p) => p.platform === "twitter")!;
      const linkedinPreview = previews.find((p) => p.platform === "linkedin")!;

      expect(twitterPreview.isOverLimit).toBe(true);
      expect(twitterPreview.remainingChars).toBeLessThan(0);
      expect(linkedinPreview.isOverLimit).toBe(false);
      expect(linkedinPreview.remainingChars).toBeGreaterThan(2000);
    });
  });

  describe("Post Scheduling & Calendar Operations", () => {
    it("rejects scheduling when the selected social account is not connected", () => {
      const result = scheduleSocialPost(
        {
          campaignId: CAMPAIGN_ID,
          campaignTitle: CAMPAIGN_TITLE,
          creatorAddress: CREATOR,
          platforms: ["twitter"],
          content: "Join our campaign launch!",
          scheduledFor: "2026-10-22T14:00:00.000Z",
        },
        undefined,
        NOW,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("Please connect your Twitter / X account in Creator Settings");
      }
    });

    it("rejects scheduling in the past", () => {
      connectSocialAccount(CREATOR, { platform: "twitter", handle: "@amazon" }, undefined, NOW);

      const result = scheduleSocialPost(
        {
          campaignId: CAMPAIGN_ID,
          campaignTitle: CAMPAIGN_TITLE,
          creatorAddress: CREATOR,
          platforms: ["twitter"],
          content: "Join our campaign launch!",
          scheduledFor: "2026-10-15T10:00:00.000Z",
        },
        undefined,
        NOW,
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain("must be in the future");
      }
    });

    it("schedules, lists, reschedules, and cancels promotional posts across connected platforms", () => {
      connectSocialAccount(CREATOR, { platform: "twitter", handle: "@amazon" }, undefined, NOW);
      connectSocialAccount(CREATOR, { platform: "linkedin", handle: "company/amazon" }, undefined, NOW);

      const scheduled = scheduleSocialPost(
        {
          campaignId: CAMPAIGN_ID,
          campaignTitle: CAMPAIGN_TITLE,
          creatorAddress: CREATOR,
          platforms: ["twitter", "linkedin"],
          content: "Milestone alert: 67% funded!",
          hashtags: ["#Amazon", "#Stellar"],
          scheduledFor: "2026-10-25T16:30:00.000Z",
        },
        undefined,
        NOW,
      );

      expect(scheduled.ok).toBe(true);
      if (!scheduled.ok) return;

      expect(scheduled.post.dateKey).toBe("2026-10-25");
      expect(scheduled.post.platforms).toEqual(["twitter", "linkedin"]);

      const listed = listScheduledPosts({ campaignId: CAMPAIGN_ID, monthKey: "2026-10" });
      expect(listed).toHaveLength(1);

      const rescheduled = rescheduleSocialPost(
        scheduled.post.id,
        "2026-10-28T18:00:00.000Z",
        undefined,
        NOW,
      );
      expect(rescheduled.ok).toBe(true);
      if (rescheduled.ok) {
        expect(rescheduled.post.dateKey).toBe("2026-10-28");
      }

      const groupedBeforeCancel = groupScheduledPostsByDate(
        listScheduledPosts({ campaignId: CAMPAIGN_ID }),
      );
      expect(groupedBeforeCancel["2026-10-28"]).toHaveLength(1);

      const cancelled = cancelScheduledPost(scheduled.post.id, undefined, NOW);
      expect(cancelled?.status).toBe("cancelled");

      const groupedAfterCancel = groupScheduledPostsByDate(
        listScheduledPosts({ campaignId: CAMPAIGN_ID }),
      );
      expect(groupedAfterCancel["2026-10-28"]).toBeUndefined();
    });

    it("generates a 42-day calendar month grid with current-month flags", () => {
      // October 2026 (monthIndex = 9)
      const grid = getCalendarMonthGrid(2026, 9);
      expect(grid).toHaveLength(42);
      const oct1 = grid.find((cell) => cell.dateKey === "2026-10-01");
      const oct31 = grid.find((cell) => cell.dateKey === "2026-10-31");
      expect(oct1?.isCurrentMonth).toBe(true);
      expect(oct31?.isCurrentMonth).toBe(true);
    });
  });
});
