import { beforeEach, describe, expect, it } from "vitest";
import {
  CampaignUpdatePreferenceError,
  dispatchCampaignUpdateNotifications,
  dispatchCampaignUpdateDigests,
  getBackerUpdatePreference,
  getCampaignUpdateDigestQueueDataSource,
  getInAppNotificationDataSource,
  isUpdateDigestDue,
  listInAppNotifications,
  markInAppNotificationRead,
  renderUpdateDigestEmail,
  renderUpdateEmail,
  resetCampaignUpdateNotificationStores,
  setBackerUpdatePreference,
  updateDigestPeriodKey,
  type BackerRecipient,
  type UpdateEmailSender,
} from "./campaign-update-notification.service";
import type { CampaignUpdatePost } from "@/types/campaign-update";

const CAMPAIGN_ID = "camp-101";
const CAMPAIGN_NAME = "Save the Amazon RainForest Reserve";

function makePost(overrides: Partial<CampaignUpdatePost> = {}): CampaignUpdatePost {
  return {
    id: "upd_1",
    campaignId: CAMPAIGN_ID,
    creatorAddress: "GD6W...X892",
    title: "We planted 120 trees",
    bodyMarkdown: "Field report from **the field**.",
    excerpt: "Field report from the field.",
    imageUrls: [],
    tags: [],
    status: "published",
    visibility: "public",
    notifyBackers: true,
    notificationMode: "instant",
    createdAt: 1_000,
    updatedAt: 1_000,
    publishedAt: 2_000,
    ...overrides,
  };
}

function makeSender(): UpdateEmailSender & { sent: Array<{ to: string; subject: string; html: string }> } {
  const sent: Array<{ to: string; subject: string; html: string }> = [];
  return {
    sent,
    async sendEmail(options) {
      sent.push(options);
      return true;
    },
  };
}

describe("campaign update notification service", () => {
  beforeEach(() => {
    resetCampaignUpdateNotificationStores();
  });

  it("stores and reads a backer preference", async () => {
    const preference = await setBackerUpdatePreference({
      campaignId: CAMPAIGN_ID,
      backerId: "GBACKER1",
      email: "backer@example.com",
      mode: "daily_digest",
    });

    expect(preference.mode).toBe("daily_digest");
    expect(preference.inAppEnabled).toBe(true);

    const stored = await getBackerUpdatePreference(CAMPAIGN_ID, "GBACKER1");
    expect(stored?.email).toBe("backer@example.com");
  });

  it("rejects an invalid email address or timezone", async () => {
    await expect(
      setBackerUpdatePreference({
        campaignId: CAMPAIGN_ID,
        backerId: "GBACKER1",
        email: "not-an-email",
        mode: "instant",
      }),
    ).rejects.toBeInstanceOf(CampaignUpdatePreferenceError);

    await expect(
      setBackerUpdatePreference({
        campaignId: CAMPAIGN_ID,
        backerId: "GBACKER1",
        mode: "instant",
        timezone: "Mars/Olympus",
      }),
    ).rejects.toBeInstanceOf(CampaignUpdatePreferenceError);
  });

  it("emails backers instantly and creates in-app notifications", async () => {
    const sender = makeSender();
    const backers: BackerRecipient[] = [
      { backerId: "GBACKER1", email: "backer1@example.com" },
      { backerId: "GBACKER2", email: "backer2@example.com" },
    ];

    const report = await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers,
      emailSender: sender,
    });

    expect(report.instantNotified).toBe(2);
    expect(report.inAppNotified).toBe(2);
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[0].subject).toContain(CAMPAIGN_NAME);

    const notifications = await listInAppNotifications("GBACKER1");
    expect(notifications).toHaveLength(1);
    expect(notifications[0].title).toBe("We planted 120 trees");
    expect(notifications[0].read).toBe(false);
  });

  it("queues digest-mode backers instead of emailing them", async () => {
    await setBackerUpdatePreference({
      campaignId: CAMPAIGN_ID,
      backerId: "GBACKER1",
      email: "backer1@example.com",
      mode: "daily_digest",
    });

    const sender = makeSender();
    const report = await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: sender,
    });

    expect(report.queuedForDigest).toBe(1);
    expect(report.instantNotified).toBe(0);
    expect(sender.sent).toHaveLength(0);

    const queue = await getCampaignUpdateDigestQueueDataSource().list();
    expect(queue).toHaveLength(1);
    expect(queue[0].backerId).toBe("GBACKER1");
  });

  it("does not queue the same update twice for a digest period", async () => {
    await setBackerUpdatePreference({
      campaignId: CAMPAIGN_ID,
      backerId: "GBACKER1",
      email: "backer1@example.com",
      mode: "weekly_digest",
    });

    const sender = makeSender();
    const input = {
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: sender,
    };

    const first = await dispatchCampaignUpdateNotifications(input);
    const second = await dispatchCampaignUpdateNotifications(input);

    expect(first.queuedForDigest).toBe(1);
    expect(second.queuedForDigest).toBe(0);
    expect(second.skippedAlreadyNotified).toBe(1);
  });

  it("skips every notification when the creator opted out", async () => {
    const sender = makeSender();
    const report = await dispatchCampaignUpdateNotifications({
      post: makePost({ notifyBackers: false }),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: sender,
    });

    expect(report.instantNotified).toBe(0);
    expect(report.inAppNotified).toBe(0);
    expect(sender.sent).toHaveLength(0);
  });

  it("respects a backer who turned email off but keeps in-app on", async () => {
    await setBackerUpdatePreference({
      campaignId: CAMPAIGN_ID,
      backerId: "GBACKER1",
      email: "backer1@example.com",
      mode: "off",
    });

    const sender = makeSender();
    const report = await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: sender,
    });

    expect(report.instantNotified).toBe(0);
    expect(report.inAppNotified).toBe(1);
    expect(sender.sent).toHaveLength(0);
  });

  it("records a delivery error without aborting the loop", async () => {
    const sender: UpdateEmailSender = {
      async sendEmail() {
        throw new Error("smtp down");
      },
    };

    const report = await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: sender,
    });

    expect(report.instantNotified).toBe(0);
    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toContain("smtp down");
  });

  it("marks in-app notifications as read", async () => {
    await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: makeSender(),
    });

    const [notification] = await listInAppNotifications("GBACKER1");
    expect(await markInAppNotificationRead(notification.id, "GBACKER1")).toBe(true);
    expect(await markInAppNotificationRead(notification.id, "SOMEONE_ELSE")).toBe(false);

    const [updated] = await listInAppNotifications("GBACKER1");
    expect(updated.read).toBe(true);
  });

  it("computes digest periods and due windows", () => {
    // 2026-10-21 is a Wednesday.
    const wednesday = Date.UTC(2026, 9, 21, 12, 0, 0);
    expect(updateDigestPeriodKey("daily_digest", wednesday, "UTC")).toBe("2026-10-21");
    // The weekly period starts on Monday.
    expect(updateDigestPeriodKey("weekly_digest", wednesday, "UTC")).toBe("2026-10-19");

    const beforeEight = Date.UTC(2026, 9, 21, 6, 0, 0);
    const afterEight = Date.UTC(2026, 9, 21, 9, 0, 0);
    expect(isUpdateDigestDue("daily_digest", undefined, beforeEight, "UTC")).toBe(false);
    expect(isUpdateDigestDue("daily_digest", undefined, afterEight, "UTC")).toBe(true);
    // Already sent for this period.
    expect(isUpdateDigestDue("daily_digest", "2026-10-21", afterEight, "UTC")).toBe(false);
    // Weekly digests only go out on Monday.
    expect(isUpdateDigestDue("weekly_digest", undefined, afterEight, "UTC")).toBe(false);
  });

  it("delivers a queued digest as one email and clears the queue", async () => {
    await setBackerUpdatePreference({
      campaignId: CAMPAIGN_ID,
      backerId: "GBACKER1",
      email: "backer1@example.com",
      mode: "daily_digest",
    });

    await dispatchCampaignUpdateNotifications({
      post: makePost(),
      context: { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
      backers: [{ backerId: "GBACKER1", email: "backer1@example.com" }],
      emailSender: makeSender(),
      now: Date.UTC(2026, 9, 21, 10, 0, 0),
    });

    const sender = makeSender();
    const deliveries = await dispatchCampaignUpdateDigests(
      sender,
      async (updateId) => (updateId === "upd_1" ? makePost() : null),
      async () => CAMPAIGN_NAME,
      Date.UTC(2026, 9, 22, 9, 0, 0),
    );

    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].ok).toBe(true);
    expect(deliveries[0].updateCount).toBe(1);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0].subject).toContain("daily digest");

    const queue = await getCampaignUpdateDigestQueueDataSource().list();
    expect(queue).toHaveLength(0);
  });

  it("renders an email for a single update", () => {
    const email = renderUpdateEmail(makePost(), {
      campaignId: CAMPAIGN_ID,
      campaignName: CAMPAIGN_NAME,
    });
    expect(email.subject).toContain("We planted 120 trees");
    expect(email.html).toContain("<strong>the field</strong>");
    expect(email.html).toContain(`/campaigns/${CAMPAIGN_ID}`);
  });

  it("renders a digest email for a batch of updates", () => {
    const email = renderUpdateDigestEmail(
      "daily_digest",
      [{ post: makePost(), campaignName: CAMPAIGN_NAME }],
      { campaignId: CAMPAIGN_ID, campaignName: CAMPAIGN_NAME },
    );
    expect(email.subject).toContain("1 campaign update");
    expect(email.html).toContain("We planted 120 trees");
  });

  it("exposes the in-app notification store", async () => {
    const store = getInAppNotificationDataSource();
    await store.save({
      id: "ntf_x",
      recipientId: "GBACKER1",
      campaignId: CAMPAIGN_ID,
      kind: "campaign_update",
      title: "Hello",
      body: "World",
      read: false,
      createdAt: 1,
    });
    const notifications = await listInAppNotifications("GBACKER1");
    expect(notifications).toHaveLength(1);
  });
});
