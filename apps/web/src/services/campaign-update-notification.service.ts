/**
 * Campaign Update Notification Service
 *
 * Fans a published campaign update out to the campaign's backers:
 *
 *   - **Email** — either instantly (one email per update) or rolled into a
 *     daily/weekly digest, depending on the backer's stored preference.
 *   - **In-app** — a notification is stored for the backer so it can be shown
 *     in the notification centre and on the campaign page.
 *
 * All state lives behind `set*` seams so a durable backend can replace the
 * in-memory stores without changing the API routes.
 */

import {
  DEFAULT_BACKER_DIGEST_TIMEZONE,
  getLocalTimeParts,
  isValidTimezone,
} from "@/lib/backer-digest-schedule";
import { renderMarkdown } from "@/lib/markdown";
import type {
  CampaignUpdateNotificationMode,
  CampaignUpdatePost,
  CampaignUpdatePreference,
  InAppNotification,
} from "@/types/campaign-update";

// ── Data sources ───────────────────────────────────────────────────────────────

export interface CampaignUpdatePreferenceDataSource {
  get(campaignId: string, backerId: string): Promise<CampaignUpdatePreference | null>;
  getForCampaign(campaignId: string): Promise<CampaignUpdatePreference[]>;
  save(preference: CampaignUpdatePreference): Promise<CampaignUpdatePreference>;
}

export interface InAppNotificationDataSource {
  list(recipientId: string): Promise<InAppNotification[]>;
  save(notification: InAppNotification): Promise<InAppNotification>;
  markRead(id: string, recipientId: string): Promise<boolean>;
  markAllRead(recipientId: string): Promise<number>;
}

export interface CampaignUpdateDigestEntry {
  id: string;
  backerId: string;
  campaignId: string;
  updateId: string;
  /** Delivery period the update was queued for (local date key). */
  periodKey: string;
  queuedAt: number;
}

export interface CampaignUpdateDigestQueueDataSource {
  enqueue(entry: CampaignUpdateDigestEntry): Promise<CampaignUpdateDigestEntry>;
  list(): Promise<CampaignUpdateDigestEntry[]>;
  remove(ids: string[]): Promise<number>;
  has(backerId: string, periodKey: string, updateId: string): Promise<boolean>;
}

export interface UpdateEmailSender {
  sendEmail(options: { to: string; subject: string; html: string }): Promise<boolean>;
}

const key = (campaignId: string, backerId: string) =>
  `${campaignId.trim().toLowerCase()}::${backerId.trim().toLowerCase()}`;

// ── In-memory stores ──────────────────────────────────────────────────────────

export class InMemoryCampaignUpdatePreferenceDataSource
  implements CampaignUpdatePreferenceDataSource
{
  private records = new Map<string, CampaignUpdatePreference>();

  async get(
    campaignId: string,
    backerId: string,
  ): Promise<CampaignUpdatePreference | null> {
    return this.records.get(key(campaignId, backerId)) ?? null;
  }

  async getForCampaign(campaignId: string): Promise<CampaignUpdatePreference[]> {
    const campaign = campaignId.trim().toLowerCase();
    return Array.from(this.records.values()).filter(
      (record) => record.campaignId.trim().toLowerCase() === campaign,
    );
  }

  async save(preference: CampaignUpdatePreference): Promise<CampaignUpdatePreference> {
    this.records.set(key(preference.campaignId, preference.backerId), preference);
    return preference;
  }
}

export class InMemoryInAppNotificationDataSource implements InAppNotificationDataSource {
  private records = new Map<string, InAppNotification>();

  async list(recipientId: string): Promise<InAppNotification[]> {
    const recipient = recipientId.trim().toLowerCase();
    return Array.from(this.records.values())
      .filter((record) => record.recipientId.trim().toLowerCase() === recipient)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async save(notification: InAppNotification): Promise<InAppNotification> {
    this.records.set(notification.id, notification);
    return notification;
  }

  async markRead(id: string, recipientId: string): Promise<boolean> {
    const notification = this.records.get(id);
    if (!notification) return false;
    if (notification.recipientId.trim().toLowerCase() !== recipientId.trim().toLowerCase()) {
      return false;
    }
    notification.read = true;
    return true;
  }

  async markAllRead(recipientId: string): Promise<number> {
    const recipient = recipientId.trim().toLowerCase();
    let updated = 0;
    for (const notification of this.records.values()) {
      if (notification.recipientId.trim().toLowerCase() !== recipient) continue;
      if (notification.read) continue;
      notification.read = true;
      updated += 1;
    }
    return updated;
  }
}

export class InMemoryCampaignUpdateDigestQueueDataSource
  implements CampaignUpdateDigestQueueDataSource
{
  private entries = new Map<string, CampaignUpdateDigestEntry>();

  async enqueue(entry: CampaignUpdateDigestEntry): Promise<CampaignUpdateDigestEntry> {
    this.entries.set(entry.id, entry);
    return entry;
  }

  async list(): Promise<CampaignUpdateDigestEntry[]> {
    return Array.from(this.entries.values()).sort((a, b) => a.queuedAt - b.queuedAt);
  }

  async remove(ids: string[]): Promise<number> {
    let removed = 0;
    for (const id of ids) {
      if (this.entries.delete(id)) removed += 1;
    }
    return removed;
  }

  async has(backerId: string, periodKey: string, updateId: string): Promise<boolean> {
    for (const entry of this.entries.values()) {
      if (
        entry.backerId === backerId &&
        entry.periodKey === periodKey &&
        entry.updateId === updateId
      ) {
        return true;
      }
    }
    return false;
  }
}

let defaultPreferences: CampaignUpdatePreferenceDataSource | undefined;
let defaultNotifications: InAppNotificationDataSource | undefined;
let defaultDigestQueue: CampaignUpdateDigestQueueDataSource | undefined;

export function getCampaignUpdatePreferenceDataSource(): CampaignUpdatePreferenceDataSource {
  return (defaultPreferences ??= new InMemoryCampaignUpdatePreferenceDataSource());
}

export function setCampaignUpdatePreferenceDataSource(
  dataSource: CampaignUpdatePreferenceDataSource,
): void {
  defaultPreferences = dataSource;
}

export function getInAppNotificationDataSource(): InAppNotificationDataSource {
  return (defaultNotifications ??= new InMemoryInAppNotificationDataSource());
}

export function setInAppNotificationDataSource(
  dataSource: InAppNotificationDataSource,
): void {
  defaultNotifications = dataSource;
}

export function getCampaignUpdateDigestQueueDataSource(): CampaignUpdateDigestQueueDataSource {
  return (defaultDigestQueue ??= new InMemoryCampaignUpdateDigestQueueDataSource());
}

export function setCampaignUpdateDigestQueueDataSource(
  dataSource: CampaignUpdateDigestQueueDataSource,
): void {
  defaultDigestQueue = dataSource;
}

/** Reset every notification store. Used by tests to isolate state. */
export function resetCampaignUpdateNotificationStores(): void {
  defaultPreferences = new InMemoryCampaignUpdatePreferenceDataSource();
  defaultNotifications = new InMemoryInAppNotificationDataSource();
  defaultDigestQueue = new InMemoryCampaignUpdateDigestQueueDataSource();
}

// ── Preferences ────────────────────────────────────────────────────────────────

export class CampaignUpdatePreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CampaignUpdatePreferenceError";
  }
}

export interface BackerUpdatePreferenceInput {
  campaignId: string;
  backerId: string;
  email?: string;
  mode: CampaignUpdateNotificationMode;
  inAppEnabled?: boolean;
  /** IANA timezone used to resolve the local digest delivery time. */
  timezone?: string;
}

/** Create or replace a backer's notification preference for a campaign. */
export async function setBackerUpdatePreference(
  input: BackerUpdatePreferenceInput,
  dataSource = getCampaignUpdatePreferenceDataSource(),
  now = Date.now(),
): Promise<CampaignUpdatePreference> {
  if (!input.campaignId?.trim()) {
    throw new CampaignUpdatePreferenceError("campaignId is required");
  }
  if (!input.backerId?.trim()) {
    throw new CampaignUpdatePreferenceError("backerId is required");
  }
  if (input.email && !/^[^\s,@]+@[^\s,@]+\.[^\s,@]+$/.test(input.email.trim())) {
    throw new CampaignUpdatePreferenceError("email is not a valid address");
  }
  if (input.timezone && !isValidTimezone(input.timezone)) {
    throw new CampaignUpdatePreferenceError("timezone must be a valid IANA timezone");
  }

  const existing = await dataSource.get(input.campaignId, input.backerId);
  const record: CampaignUpdatePreference = {
    campaignId: input.campaignId.trim(),
    backerId: input.backerId.trim(),
    email: input.email?.trim() ?? existing?.email,
    mode: input.mode,
    inAppEnabled: input.inAppEnabled ?? existing?.inAppEnabled ?? true,
    timezone: input.timezone ?? existing?.timezone ?? DEFAULT_BACKER_DIGEST_TIMEZONE,
    lastSentPeriod: existing?.lastSentPeriod,
    lastSentAt: existing?.lastSentAt ?? 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return dataSource.save(record);
}

/** Read a backer's preference for a campaign. */
export async function getBackerUpdatePreference(
  campaignId: string,
  backerId: string,
  dataSource = getCampaignUpdatePreferenceDataSource(),
): Promise<CampaignUpdatePreference | null> {
  return dataSource.get(campaignId, backerId);
}

// ── Digest scheduling ──────────────────────────────────────────────────────────

/** Local date key (`YYYY-MM-DD`) used as the daily digest period. */
export function updateDigestPeriodKey(
  mode: CampaignUpdateNotificationMode,
  now: number,
  timezone = DEFAULT_BACKER_DIGEST_TIMEZONE,
): string {
  if (mode === "weekly_digest") {
    const parts = getLocalTimeParts(now, timezone);
    const [year, month, day] = parts.date.split("-").map(Number);
    const utcMidnight = Date.UTC(year, month - 1, day);
    const weekday = new Date(utcMidnight).getUTCDay();
    // Shift so the week starts on Monday.
    const daysSinceMonday = (weekday + 6) % 7;
    return new Date(utcMidnight - daysSinceMonday * 86_400_000)
      .toISOString()
      .slice(0, 10);
  }
  return getLocalTimeParts(now, timezone).date;
}

/**
 * Whether a digest of this mode is due at `now`.
 *
 * Daily digests go out from 08:00 local time onwards on the day they cover;
 * weekly digests go out from 08:00 local time on Monday for the week they
 * cover. `lastSentPeriod` guarantees at most one digest per period.
 */
export function isUpdateDigestDue(
  mode: CampaignUpdateNotificationMode,
  lastSentPeriod: string | undefined,
  now: number,
  timezone = DEFAULT_BACKER_DIGEST_TIMEZONE,
): boolean {
  if (mode !== "daily_digest" && mode !== "weekly_digest") return false;
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_BACKER_DIGEST_TIMEZONE;
  const local = getLocalTimeParts(now, tz);
  if (local.hour < 8) return false;
  if (mode === "weekly_digest" && local.weekday !== "Mon") return false;
  return lastSentPeriod !== updateDigestPeriodKey(mode, now, tz);
}

// ── Email rendering ────────────────────────────────────────────────────────────

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface UpdateEmailContext {
  campaignId: string;
  campaignName: string;
  /** Base URL used to build the "read on Fundable" link. */
  origin?: string;
}

function campaignLink(campaignId: string, origin?: string): string {
  const base = (origin ?? "https://fundable.stellar").replace(/\/+$/, "");
  return `${base}/campaigns/${encodeURIComponent(campaignId)}`;
}

/** Build the email for a single, instantly delivered update. */
export function renderUpdateEmail(
  post: CampaignUpdatePost,
  context: UpdateEmailContext,
): { subject: string; html: string } {
  const body = renderMarkdown(post.bodyMarkdown);
  const images = post.imageUrls
    .filter((url) => /^https?:\/\//i.test(url))
    .map(
      (url) =>
        `<img src="${escapeHtml(url)}" alt="" style="max-width:100%;height:auto;border-radius:8px;margin:8px 0;" />`,
    )
    .join("");

  return {
    subject: `New update from ${context.campaignName}: ${post.title}`,
    html: [
      `<div style="font-family:sans-serif;line-height:1.6;">`,
      `<h2 style="margin:0 0 8px;">${escapeHtml(post.title)}</h2>`,
      `<p style="margin:0 0 12px;color:#6b7280;font-size:13px;">`,
      `A new update was posted on <strong>${escapeHtml(context.campaignName)}</strong>.`,
      `</p>`,
      body,
      images,
      `<p style="margin:16px 0 0;">`,
      `<a href="${escapeHtml(campaignLink(context.campaignId, context.origin))}">`,
      `Read the full update on Fundable`,
      `</a></p>`,
      `</div>`,
    ].join(""),
  };
}

/** Build the email for a batch of updates delivered as a digest. */
export function renderUpdateDigestEmail(
  mode: Exclude<CampaignUpdateNotificationMode, "instant" | "off">,
  updates: Array<{ post: CampaignUpdatePost; campaignName: string }>,
  context: UpdateEmailContext,
): { subject: string; html: string } {
  const label = mode === "daily_digest" ? "Daily" : "Weekly";
  const items = updates
    .map(({ post, campaignName }) => {
      const excerpt = post.excerpt ?? post.title;
      return [
        `<li style="margin-bottom:12px;">`,
        `<strong>${escapeHtml(post.title)}</strong>`,
        `<span style="color:#6b7280;"> — ${escapeHtml(campaignName)}</span>`,
        `<div style="color:#4b5563;font-size:14px;">${escapeHtml(excerpt)}</div>`,
        `<a href="${escapeHtml(campaignLink(post.campaignId, context.origin))}" style="font-size:13px;">Read update</a>`,
        `</li>`,
      ].join("");
    })
    .join("");

  return {
    subject: `Your ${label.toLowerCase()} digest: ${updates.length} campaign update${
      updates.length === 1 ? "" : "s"
    }`,
    html: [
      `<div style="font-family:sans-serif;line-height:1.6;">`,
      `<h2 style="margin:0 0 12px;">${label} digest of your campaign updates</h2>`,
      `<ul style="padding-left:18px;">${items}</ul>`,
      `</div>`,
    ].join(""),
  };
}

// ── Dispatch ───────────────────────────────────────────────────────────────────

export interface BackerRecipient {
  backerId: string;
  email?: string;
}

/** Resolve the notification mode that applies to a backer. */
export async function resolveBackerNotificationMode(
  campaignId: string,
  backerId: string,
  fallback: CampaignUpdateNotificationMode,
  preferences = getCampaignUpdatePreferenceDataSource(),
): Promise<CampaignUpdateNotificationMode> {
  const preference = await preferences.get(campaignId, backerId);
  return preference?.mode ?? fallback;
}

export interface CampaignUpdateDispatchInput {
  post: CampaignUpdatePost;
  context: UpdateEmailContext;
  backers: BackerRecipient[];
  emailSender: UpdateEmailSender;
  now?: number;
  preferences?: CampaignUpdatePreferenceDataSource;
  notifications?: InAppNotificationDataSource;
  digestQueue?: CampaignUpdateDigestQueueDataSource;
}

export interface CampaignUpdateDispatchReport {
  updateId: string;
  /** Backers emailed right away. */
  instantNotified: number;
  /** Backers whose update was queued for a digest. */
  queuedForDigest: number;
  /** In-app notifications created. */
  inAppNotified: number;
  /** Backers already queued for this digest period. */
  skippedAlreadyNotified: number;
  errors: string[];
}

/**
 * Notify the backers of a published update.
 *
 * Each backer's stored preference decides whether they receive an instant
 * email, a daily/weekly digest, or nothing at all; backers without a stored
 * preference fall back to the mode declared on the update itself. Delivery
 * failures are collected but never abort the loop.
 */
export async function dispatchCampaignUpdateNotifications(
  input: CampaignUpdateDispatchInput,
): Promise<CampaignUpdateDispatchReport> {
  const {
    post,
    context,
    backers,
    emailSender,
    now = Date.now(),
    preferences = getCampaignUpdatePreferenceDataSource(),
    notifications = getInAppNotificationDataSource(),
    digestQueue = getCampaignUpdateDigestQueueDataSource(),
  } = input;

  const report: CampaignUpdateDispatchReport = {
    updateId: post.id,
    instantNotified: 0,
    queuedForDigest: 0,
    inAppNotified: 0,
    skippedAlreadyNotified: 0,
    errors: [],
  };

  if (!post.notifyBackers) {
    return report;
  }

  const email = renderUpdateEmail(post, context);

  for (const backer of backers) {
    if (!backer.backerId?.trim()) continue;

    const preference = await preferences.get(post.campaignId, backer.backerId);
    const mode = preference?.mode ?? post.notificationMode;
    const inAppEnabled = preference?.inAppEnabled ?? true;
    const address = backer.email ?? preference?.email;

    // ── In-app ────────────────────────────────────────────────────────────
    if (inAppEnabled) {
      try {
        await notifications.save({
          id: `ntf_${crypto.randomUUID()}`,
          recipientId: backer.backerId.trim(),
          campaignId: post.campaignId,
          updateId: post.id,
          kind: "campaign_update",
          title: post.title,
          body: post.excerpt ?? `New update from ${context.campaignName}`,
          link: `/campaigns/${post.campaignId}`,
          read: false,
          createdAt: now,
        });
        report.inAppNotified += 1;
      } catch (err) {
        report.errors.push(
          `in-app:${backer.backerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // ── Email ─────────────────────────────────────────────────────────────
    if (mode === "off") continue;

    if (mode === "instant") {
      if (!address) {
        report.errors.push(`email:${backer.backerId}: no email address on file`);
        continue;
      }
      try {
        await emailSender.sendEmail({
          to: address,
          subject: email.subject,
          html: email.html,
        });
        report.instantNotified += 1;
      } catch (err) {
        report.errors.push(
          `email:${backer.backerId}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      continue;
    }

    // Digest modes: queue the update for the backer's next digest.
    const periodKey = updateDigestPeriodKey(mode, now);
    const alreadyQueued = await digestQueue.has(backer.backerId.trim(), periodKey, post.id);
    if (alreadyQueued) {
      report.skippedAlreadyNotified += 1;
      continue;
    }
    try {
      await digestQueue.enqueue({
        id: `dig_${crypto.randomUUID()}`,
        backerId: backer.backerId.trim(),
        campaignId: post.campaignId,
        updateId: post.id,
        periodKey,
        queuedAt: now,
      });
      report.queuedForDigest += 1;
    } catch (err) {
      report.errors.push(
        `digest:${backer.backerId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return report;
}

// ── Digest delivery ────────────────────────────────────────────────────────────

export interface CampaignUpdateDigestDelivery {
  backerId: string;
  ok: boolean;
  updateCount: number;
  skipped?: boolean;
  error?: string;
}

/**
 * Deliver every digest that is due.
 *
 * Updates queued for a digest period are grouped per backer and sent as one
 * email. The queue entries are removed once the digest is sent, so a failure
 * leaves the entries in place for the next run.
 */
export async function dispatchCampaignUpdateDigests(
  emailSender: UpdateEmailSender,
  updatesLookup: (updateId: string) => Promise<CampaignUpdatePost | null>,
  campaignNameLookup: (campaignId: string) => Promise<string>,
  now: number = Date.now(),
  preferences = getCampaignUpdatePreferenceDataSource(),
  digestQueue = getCampaignUpdateDigestQueueDataSource(),
): Promise<CampaignUpdateDigestDelivery[]> {
  const deliveries: CampaignUpdateDigestDelivery[] = [];
  const entries = await digestQueue.list();
  if (!entries.length) return deliveries;

  const grouped = new Map<string, CampaignUpdateDigestEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.backerId) ?? [];
    group.push(entry);
    grouped.set(entry.backerId, group);
  }

  for (const [backerId, group] of grouped) {
    const preference = await preferences.get(group[0].campaignId, backerId);
    const mode = preference?.mode ?? "daily_digest";
    const timezone = preference?.timezone ?? DEFAULT_BACKER_DIGEST_TIMEZONE;
    const lastSentPeriod = preference?.lastSentPeriod;

    if (!isUpdateDigestDue(mode, lastSentPeriod, now, timezone)) {
      deliveries.push({ backerId, ok: true, updateCount: 0, skipped: true });
      continue;
    }

    try {
      const updates: Array<{ post: CampaignUpdatePost; campaignName: string }> = [];
      for (const entry of group) {
        const post = await updatesLookup(entry.updateId);
        if (!post) continue;
        updates.push({ post, campaignName: await campaignNameLookup(post.campaignId) });
      }

      if (updates.length) {
        const address = preference?.email;
        if (!address) {
          deliveries.push({
            backerId,
            ok: false,
            updateCount: updates.length,
            error: "no email address on file",
          });
          continue;
        }
        const email = renderUpdateDigestEmail(
          mode === "weekly_digest" ? "weekly_digest" : "daily_digest",
          updates,
          { campaignId: group[0].campaignId, campaignName: "" },
        );
        await emailSender.sendEmail({ to: address, subject: email.subject, html: email.html });
      }

      await digestQueue.remove(group.map((entry) => entry.id));
      if (preference) {
        await preferences.save({
          ...preference,
          lastSentPeriod: updateDigestPeriodKey(mode, now, timezone),
          lastSentAt: updates.length ? now : preference.lastSentAt,
          updatedAt: now,
        });
      }
      deliveries.push({ backerId, ok: true, updateCount: updates.length });
    } catch (err) {
      deliveries.push({
        backerId,
        ok: false,
        updateCount: group.length,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return deliveries;
}

// ── In-app notification helpers ────────────────────────────────────────────────

/** List the in-app notifications of a recipient, newest first. */
export async function listInAppNotifications(
  recipientId: string,
  dataSource = getInAppNotificationDataSource(),
): Promise<InAppNotification[]> {
  if (!recipientId?.trim()) return [];
  return dataSource.list(recipientId);
}

/** Mark a single in-app notification as read. */
export async function markInAppNotificationRead(
  id: string,
  recipientId: string,
  dataSource = getInAppNotificationDataSource(),
): Promise<boolean> {
  return dataSource.markRead(id, recipientId);
}

/** Mark every in-app notification of a recipient as read. */
export async function markAllInAppNotificationsRead(
  recipientId: string,
  dataSource = getInAppNotificationDataSource(),
): Promise<number> {
  if (!recipientId?.trim()) return 0;
  return dataSource.markAllRead(recipientId);
}
