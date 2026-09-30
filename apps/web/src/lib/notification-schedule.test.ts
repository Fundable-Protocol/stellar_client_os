import { describe, expect, it } from "vitest";
import {
  isDigestDue,
  isMilestoneEvent,
  nextDigestDueAt,
  NOTIFICATION_FREQUENCIES,
  parseNotificationPreferences,
  shouldNotify,
} from "./notification-schedule";

const DAY = 86_400_000;

describe("nextDigestDueAt / isDigestDue", () => {
  it("computes the next due time per frequency", () => {
    expect(nextDigestDueAt("daily", 0)).toBe(DAY);
    expect(nextDigestDueAt("weekly", 0)).toBe(7 * DAY);
    expect(nextDigestDueAt("monthly", 0)).toBe(30 * DAY);
    expect(nextDigestDueAt("milestones", 0)).toBeNull();
  });

  it("reports due only after the interval elapses", () => {
    expect(isDigestDue({ frequency: "daily" }, 0, DAY - 1)).toBe(false);
    expect(isDigestDue({ frequency: "daily" }, 0, DAY)).toBe(true);
    expect(isDigestDue({ frequency: "weekly" }, 0, 6 * DAY)).toBe(false);
    expect(isDigestDue({ frequency: "weekly" }, 0, 7 * DAY)).toBe(true);
  });

  it("never schedules digests in milestones mode", () => {
    expect(isDigestDue({ frequency: "milestones" }, 0, Date.now() + 10 * DAY)).toBe(false);
  });
});

describe("isMilestoneEvent / shouldNotify", () => {
  it("detects milestone events", () => {
    expect(isMilestoneEvent({ type: "milestone", milestoneKey: "50_percent" })).toBe(true);
    expect(isMilestoneEvent({ type: "milestone", milestoneKey: "" })).toBe(false);
    expect(isMilestoneEvent({ type: "progress" })).toBe(false);
  });

  it("milestones always notify, regardless of frequency", () => {
    const ms = { type: "milestone", milestoneKey: "goal_reached" } as const;
    expect(shouldNotify({ frequency: "milestones" }, ms, 0, 1000)).toBe(true);
    expect(shouldNotify({ frequency: "daily" }, ms, Date.now(), 1000)).toBe(true);
  });

  it("progress only notifies when due", () => {
    const progress = { type: "progress" } as const;
    expect(shouldNotify({ frequency: "weekly" }, progress, 0, 6 * DAY)).toBe(false);
    expect(shouldNotify({ frequency: "weekly" }, progress, 0, 7 * DAY)).toBe(true);
  });
});

describe("parseNotificationPreferences", () => {
  it("accepts valid email and push preferences", () => {
    const email = parseNotificationPreferences({
      frequency: "weekly",
      channel: "email",
      email: "a@b.co",
    });
    expect(email.ok).toBe(true);

    const push = parseNotificationPreferences({
      frequency: "milestones",
      channel: "push",
      pushEndpoint: "https://push.example/ep1",
    });
    expect(push.ok).toBe(true);
  });

  it("requires channel-specific fields", () => {
    const noEmail = parseNotificationPreferences({ frequency: "daily", channel: "email" });
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) expect(noEmail.error).toMatch(/email address is required/);

    const noEndpoint = parseNotificationPreferences({ frequency: "daily", channel: "push" });
    expect(noEndpoint.ok).toBe(false);
    if (!noEndpoint.ok) expect(noEndpoint.error).toMatch(/pushEndpoint is required/);
  });

  it("rejects invalid frequencies and channels", () => {
    expect(parseNotificationPreferences({ frequency: "hourly", channel: "email", email: "a@b.co" }).ok).toBe(false);
    expect(parseNotificationPreferences({ frequency: "daily", channel: "sms", email: "a@b.co" }).ok).toBe(false);
  });
});
