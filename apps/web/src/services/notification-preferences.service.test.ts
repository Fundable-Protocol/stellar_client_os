import { beforeEach, describe, expect, it } from "vitest";
import {
  getDueDigests,
  getPreferences,
  getPreferencesForCampaign,
  InMemoryPreferencesDataSource,
  markNotified,
  PreferencesValidationError,
  setNotificationPreferencesDataSource,
  setPreferences,
} from "./notification-preferences.service";

const DAY = 86_400_000;

beforeEach(() => setNotificationPreferencesDataSource(new InMemoryPreferencesDataSource()));

describe("setPreferences", () => {
  it("creates a preference record", async () => {
    const prefs = await setPreferences({
      campaignId: "c1",
      sponsorId: "s1",
      frequency: "weekly",
      channel: "email",
      email: "a@b.co",
    });
    expect(prefs.frequency).toBe("weekly");
    expect(prefs.lastNotifiedAt).toBe(0);
    expect(prefs.createdAt).toBeGreaterThan(0);
  });

  it("updates in place and preserves lastNotifiedAt", async () => {
    await setPreferences({ campaignId: "c1", sponsorId: "s1", frequency: "daily", channel: "email", email: "a@b.co" });
    await markNotified("c1", "s1", 1_000);
    const updated = await setPreferences({
      campaignId: "c1",
      sponsorId: "s1",
      frequency: "monthly",
      channel: "push",
      pushEndpoint: "https://push.example/ep",
    });
    expect(updated.frequency).toBe("monthly");
    expect(updated.lastNotifiedAt).toBe(1_000);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(updated.createdAt);
  });

  it("rejects invalid preferences", async () => {
    await expect(
      setPreferences({ campaignId: "c1", sponsorId: "s1", frequency: "daily", channel: "email" }),
    ).rejects.toThrow(PreferencesValidationError);
    await expect(
      setPreferences({ campaignId: "c1", sponsorId: "s1", frequency: "hourly", channel: "push", pushEndpoint: "x" }),
    ).rejects.toThrow(PreferencesValidationError);
  });
});

describe("getPreferences / getPreferencesForCampaign", () => {
  it("fetches one sponsor or the whole campaign", async () => {
    await setPreferences({ campaignId: "c1", sponsorId: "s1", frequency: "daily", channel: "email", email: "a@b.co" });
    await setPreferences({ campaignId: "c1", sponsorId: "s2", frequency: "weekly", channel: "push", pushEndpoint: "ep" });

    expect((await getPreferences("c1", "s1"))!.frequency).toBe("daily");
    expect(await getPreferences("c1", "ghost")).toBeNull();
    expect(await getPreferencesForCampaign("c1")).toHaveLength(2);
    expect(await getPreferencesForCampaign("c2")).toHaveLength(0);
  });
});

describe("getDueDigests / markNotified", () => {
  it("includes only sponsors whose interval has elapsed", async () => {
    const now = 100 * DAY;
    await setPreferences({ campaignId: "c1", sponsorId: "daily", frequency: "daily", channel: "email", email: "a@b.co" }, undefined, now - 10 * DAY);
    await setPreferences({ campaignId: "c1", sponsorId: "weekly", frequency: "weekly", channel: "email", email: "b@b.co" }, undefined, now - 3 * DAY);
    await setPreferences({ campaignId: "c1", sponsorId: "milestone", frequency: "milestones", channel: "push", pushEndpoint: "ep" }, undefined, now - 300 * DAY);

    const due = await getDueDigests(now);
    expect(due.map((p) => p.sponsorId).sort()).toEqual(["daily", "weekly"]);
  });

  it("markNotified advances the schedule", async () => {
    await setPreferences({ campaignId: "c1", sponsorId: "s1", frequency: "daily", channel: "email", email: "a@b.co" }, undefined, 0);
    expect(await getDueDigests(DAY)).toHaveLength(1);
    await markNotified("c1", "s1", DAY);
    expect(await getDueDigests(DAY + 1)).toHaveLength(0);
    expect(await getDueDigests(2 * DAY)).toHaveLength(1);
    expect(await markNotified("c1", "ghost")).toBeNull();
  });
});
