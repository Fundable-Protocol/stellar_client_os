import { describe, expect, it } from "vitest";
import { buildCampaignNotificationDispatch, isNotificationDue, type CampaignNotificationPreference } from "./campaign-notification.service";

const campaign = { id: "campaign-1", name: "Mangrove restoration", raisedAmount: "500", goalAmount: "1000" };

describe("campaign notification preferences", () => {
  it("supports milestone-only email and push notifications", () => {
    const preferences: CampaignNotificationPreference[] = [{
      recipientId: "sponsor-1",
      email: "sponsor@example.com",
      pushToken: "push-token",
      channels: ["email", "push"],
      frequency: "milestones",
    }];
    const dispatch = buildCampaignNotificationDispatch(campaign, [50], preferences, 10_000);
    expect(dispatch.emails[0].to).toBe("sponsor@example.com");
    expect(dispatch.pushes[0].data).toMatchObject({ campaignId: "campaign-1", milestone: "50" });
    expect(dispatch.updatedPreferences[0].lastNotifiedAt).toBe(10_000);
  });
  it("does not notify a daily preference until its window elapses", () => {
    const preference: CampaignNotificationPreference = {
      recipientId: "sponsor-1",
      email: "sponsor@example.com",
      channels: ["email"],
      frequency: "daily",
      lastNotifiedAt: 10_000,
    };
    expect(isNotificationDue(preference, 10_000 + 23 * 60 * 60 * 1000, false)).toBe(false);
    expect(isNotificationDue(preference, 10_000 + 24 * 60 * 60 * 1000, false)).toBe(true);
  });
  it("allows different recipients to choose different frequencies and channels", () => {
    const dispatch = buildCampaignNotificationDispatch(campaign, [], [
      { recipientId: "email", email: "a@example.com", channels: ["email"], frequency: "weekly" },
      { recipientId: "push", pushToken: "token", channels: ["push"], frequency: "monthly" },
    ], 10_000);
    expect(dispatch.emails).toHaveLength(1);
    expect(dispatch.pushes).toHaveLength(1);
  });
});
