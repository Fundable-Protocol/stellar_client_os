import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, renderDigestEmail, renderMilestoneEmail } from "./route";
import {
  getPreferences,
  InMemoryPreferencesDataSource,
  setNotificationPreferencesDataSource,
  setPreferences,
} from "@/services/notification-preferences.service";

const { sendEmailMock } = vi.hoisted(() => ({ sendEmailMock: vi.fn(async () => true) }));

vi.mock("@/services/email.service", () => ({
  EmailService: class {
    sendEmail = sendEmailMock;
  },
}));

const DAY = 86_400_000;

async function seed(prefs: Array<{ sponsorId: string; frequency: "daily" | "weekly" | "monthly" | "milestones"; channel: "email" | "push"; email?: string; pushEndpoint?: string; lastNotifiedAt?: number }>) {
  for (const p of prefs) {
    await setPreferences({
      campaignId: "c1",
      sponsorId: p.sponsorId,
      frequency: p.frequency,
      channel: p.channel,
      email: p.email,
      pushEndpoint: p.pushEndpoint,
    });
    if (p.lastNotifiedAt) {
      const { markNotified } = await import("@/services/notification-preferences.service");
      await markNotified("c1", p.sponsorId, p.lastNotifiedAt);
    }
  }
}

beforeEach(() => {
  setNotificationPreferencesDataSource(new InMemoryPreferencesDataSource());
  sendEmailMock.mockClear();
});

describe("email renderers", () => {
  it("renders digest and milestone content", () => {
    const digest = renderDigestEmail("c1", "Forest", 42, 120);
    expect(digest.subject).toContain("42% funded");
    expect(digest.html).toContain("120");

    const ms = renderMilestoneEmail("c1", "Forest", "goal_reached");
    expect(ms.subject).toContain("Goal reached");
  });
});

describe("POST /api/notifications/dispatch", () => {
  it("sends milestone events to all sponsors regardless of frequency", async () => {
    await seed([
      { sponsorId: "weekly", frequency: "weekly", channel: "email", email: "w@b.co", lastNotifiedAt: Date.now() },
      { sponsorId: "milestones", frequency: "milestones", channel: "email", email: "m@b.co" },
    ]);

    const res = await POST(
      new Request("https://app.test/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: { type: "milestone", milestoneKey: "goal_reached" },
          campaign: { id: "c1", name: "Forest" },
        }),
      }),
    );
    const body = await res.json();
    expect(body.mode).toBe("milestone");
    expect(body.sent).toBe(2);
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
  });

  it("digest mode sends only to due sponsors and advances their schedule", async () => {
    await seed([
      { sponsorId: "due", frequency: "daily", channel: "email", email: "d@b.co", lastNotifiedAt: Date.now() - 2 * DAY },
      { sponsorId: "notdue", frequency: "daily", channel: "email", email: "n@b.co", lastNotifiedAt: Date.now() - 1000 },
    ]);

    const res = await POST(
      new Request("https://app.test/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaign: { id: "c1", name: "Forest", progressPct: 42, trees: 10 },
        }),
      }),
    );
    const body = await res.json();
    expect(body.mode).toBe("digest");
    expect(body.sent).toBe(1);
    expect(body.deliveries[0].sponsorId).toBe("due");

    const prefs = await getPreferences("c1", "due");
    expect(prefs!.lastNotifiedAt).toBeGreaterThan(Date.now() - 60_000);
  });

  it("400s on invalid JSON and on milestone without campaign id", async () => {
    const bad = await POST(
      new Request("https://app.test/api/notifications/dispatch", {
        method: "POST",
        body: "{bad",
      }),
    );
    expect(bad.status).toBe(400);

    const noCampaign = await POST(
      new Request("https://app.test/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: { type: "milestone", milestoneKey: "50_percent" } }),
      }),
    );
    expect(noCampaign.status).toBe(400);
  });

  it("delivers push-channel preferences without the email service", async () => {
    await seed([{ sponsorId: "pusher", frequency: "daily", channel: "push", pushEndpoint: "https://push/ep", lastNotifiedAt: Date.now() - 2 * DAY }]);

    const res = await POST(
      new Request("https://app.test/api/notifications/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaign: { id: "c1", name: "Forest", progressPct: 10, trees: 2 } }),
      }),
    );
    const body = await res.json();
    expect(body.sent).toBe(1);
    expect(body.deliveries[0].channel).toBe("push");
    expect(sendEmailMock).not.toHaveBeenCalled();
  });
});
