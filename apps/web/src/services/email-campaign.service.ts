/**
 * EmailCampaignService
 *
 * Manages the full lifecycle of creator email campaigns:
 *   1. CRUD for draft campaigns with a block-based content model.
 *   2. Audience segmentation — filter backers by reward tier and/or pledge
 *      amount before every send.
 *   3. Sending — renders blocks to HTML and dispatches via EmailService.
 *   4. Analytics — accumulates open/click tracking events and exposes
 *      per-campaign open-rate / click-rate metrics.
 *
 * Storage is in-memory (same singleton pattern used by campaign-follow,
 * campaign-community, etc.) — swap `this.campaigns` / `this.events` for a
 * real database without changing the public API.
 */

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { EmailService } from "./email.service";
import { parseTokenAmount } from "@/types/campaign-backers";
import type { BackerContribution } from "@/types/campaign-backers";
import type {
  AudienceSegment,
  CreateEmailCampaignInput,
  EmailBlock,
  EmailCampaign,
  EmailCampaignAnalytics,
  EmailCampaignSendRecord,
  EmailCampaignStatus,
  EmailTrackingEvent,
  RecordTrackingEventInput,
  SendError,
  TrackingEventType,
  UpdateEmailCampaignInput,
} from "@/types/email-campaign";

// ─── HTML renderer ─────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function renderBlock(block: EmailBlock): string {
  switch (block.type) {
    case "heading": {
      const tag = `h${block.level}`;
      return `<${tag} style="text-align:${block.align};margin:0 0 12px">${escHtml(block.content)}</${tag}>`;
    }
    case "text":
      return `<p style="text-align:${block.align};margin:0 0 12px;line-height:1.6">${escHtml(block.content).replace(/\n/g, "<br>")}</p>`;
    case "image": {
      const img = `<img src="${escHtml(block.src)}" alt="${escHtml(block.alt)}"${block.width ? ` width="${block.width}"` : ""} style="max-width:100%;display:block">`;
      return `<div style="margin:0 0 12px">${block.link ? `<a href="${escHtml(block.link)}">${img}</a>` : img}</div>`;
    }
    case "button":
      return `<div style="text-align:${block.align};margin:0 0 12px"><a href="${escHtml(block.href)}" style="display:inline-block;padding:12px 24px;background:${escHtml(block.backgroundColor)};color:${escHtml(block.textColor)};text-decoration:none;border-radius:4px;font-weight:600">${escHtml(block.label)}</a></div>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid ${escHtml(block.color)};margin:16px 0">`;
    case "spacer":
      return `<div style="height:${Number(block.height)}px"></div>`;
    default:
      return "";
  }
}

export function renderBlocksToHtml(blocks: EmailBlock[], subject: string, previewText?: string): string {
  const preview = previewText
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escHtml(previewText)}</div>`
    : "";
  const body = blocks.map(renderBlock).join("\n");
  return [
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${escHtml(subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">`,
    preview,
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5"><tr><td align="center" style="padding:32px 16px">',
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden">',
    '<tr><td style="padding:32px">',
    body,
    "</td></tr></table>",
    "</td></tr></table></body></html>",
  ].join("\n");
}

// ─── Audience resolution ───────────────────────────────────────────────────────

export interface BackerEmailRecord {
  /** Stellar address or some unique backer identifier. */
  backerAddress: string;
  email: string;
  /** The reward tier name this backer is associated with, if any. */
  rewardTier?: string;
  /** Total pledge amount (decimal string in the campaign token). */
  totalPledgeAmount: string;
}

/**
 * Filter a list of backer email records according to `segment`.
 * When `segment.includeAll` is true all records pass regardless of other
 * filters.
 */
export function resolveAudience(
  backers: BackerEmailRecord[],
  segment: AudienceSegment,
): BackerEmailRecord[] {
  if (segment.includeAll) return [...backers];

  return backers.filter((backer) => {
    // Reward tier filter
    if (segment.rewardTiers && segment.rewardTiers.length > 0) {
      if (!backer.rewardTier || !segment.rewardTiers.includes(backer.rewardTier)) {
        return false;
      }
    }

    // Min pledge amount
    if (segment.minPledgeAmount !== undefined && segment.minPledgeAmount !== "") {
      const backerScaled = parseTokenAmount(backer.totalPledgeAmount);
      const minScaled = parseTokenAmount(segment.minPledgeAmount);
      if (backerScaled === null || minScaled === null || backerScaled < minScaled) return false;
    }

    // Max pledge amount
    if (segment.maxPledgeAmount !== undefined && segment.maxPledgeAmount !== "") {
      const backerScaled = parseTokenAmount(backer.totalPledgeAmount);
      const maxScaled = parseTokenAmount(segment.maxPledgeAmount);
      if (backerScaled === null || maxScaled === null || backerScaled > maxScaled) return false;
    }

    return true;
  });
}

/** Hash a recipient email for privacy-safe analytics. */
export function hashEmail(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

// ─── Service ───────────────────────────────────────────────────────────────────

const DEFAULT_AUDIENCE: AudienceSegment = { includeAll: true };

export class EmailCampaignService {
  private campaigns = new Map<string, EmailCampaign>();
  private events = new Map<string, EmailTrackingEvent[]>();

  constructor(private readonly emailService: EmailService = new EmailService()) {}

  // ── CRUD ────────────────────────────────────────────────────────────────────

  create(input: CreateEmailCampaignInput, now = Date.now()): EmailCampaign {
    if (!input.campaignId?.trim()) throw new Error("campaignId is required");
    if (!input.creatorAddress?.trim()) throw new Error("creatorAddress is required");
    if (!input.subject?.trim()) throw new Error("subject is required");

    const campaign: EmailCampaign = {
      id: randomUUID(),
      campaignId: input.campaignId.trim(),
      creatorAddress: input.creatorAddress.trim(),
      subject: input.subject.trim(),
      previewText: input.previewText?.trim(),
      blocks: input.blocks ?? [],
      audience: input.audience ?? DEFAULT_AUDIENCE,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      scheduledAt: input.scheduledAt,
    };

    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  getById(id: string): EmailCampaign | undefined {
    return this.campaigns.get(id?.trim() ?? "");
  }

  listByCampaign(campaignId: string): EmailCampaign[] {
    const needle = campaignId?.trim() ?? "";
    return [...this.campaigns.values()].filter((ec) => ec.campaignId === needle);
  }

  update(id: string, input: UpdateEmailCampaignInput, now = Date.now()): EmailCampaign {
    const existing = this.getById(id);
    if (!existing) throw new Error(`Email campaign ${id} not found`);
    if (existing.status !== "draft") throw new Error("Only draft campaigns can be updated");

    if (input.subject !== undefined) existing.subject = input.subject.trim();
    if (input.previewText !== undefined) existing.previewText = input.previewText.trim();
    if (input.blocks !== undefined) existing.blocks = input.blocks;
    if (input.audience !== undefined) existing.audience = input.audience;
    if (input.scheduledAt !== undefined) existing.scheduledAt = input.scheduledAt;
    existing.updatedAt = now;

    return existing;
  }

  delete(id: string): boolean {
    const existing = this.getById(id);
    if (!existing) return false;
    if (existing.status === "sent") throw new Error("Sent campaigns cannot be deleted");
    return this.campaigns.delete(id);
  }

  // ── Send ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve the audience, render the email, and dispatch to all matching
   * backers. Errors are collected per recipient and never thrown — a failed
   * individual send does not abort the rest.
   *
   * @param id             Email campaign id
   * @param allBackers     Full list of backers with email addresses and pledge data
   * @param now            Injectable timestamp for testing
   */
  async send(
    id: string,
    allBackers: BackerEmailRecord[],
    now = Date.now(),
  ): Promise<EmailCampaignSendRecord> {
    const campaign = this.getById(id);
    if (!campaign) throw new Error(`Email campaign ${id} not found`);
    if (campaign.status === "sent") throw new Error("Campaign has already been sent");

    // Segment
    const recipients = resolveAudience(allBackers, campaign.audience);

    // Render HTML once — same body for all recipients
    const html = renderBlocksToHtml(campaign.blocks, campaign.subject, campaign.previewText);

    const errors: SendError[] = [];

    for (const recipient of recipients) {
      try {
        await this.emailService.sendEmail({
          to: recipient.email,
          subject: campaign.subject,
          html,
        });
      } catch (err) {
        errors.push({
          email: recipient.email,
          reason: err instanceof Error ? err.message : String(err),
        });
        console.error(`[EmailCampaignService] Failed to send to ${recipient.email}:`, err);
      }
    }

    const record: EmailCampaignSendRecord = {
      emailCampaignId: id,
      sentAt: now,
      recipientCount: recipients.length,
      errors,
    };

    campaign.status = errors.length < recipients.length ? "sent" : (recipients.length === 0 ? "sent" : "failed");
    campaign.sendRecord = record;
    campaign.updatedAt = now;

    return record;
  }

  // ── Analytics ─────────────────────────────────────────────────────────────────

  /**
   * Record a tracking event (open or click) for an email campaign.
   * Called by the tracking pixel / redirect endpoints.
   */
  recordEvent(input: RecordTrackingEventInput, now = Date.now()): EmailTrackingEvent {
    const event: EmailTrackingEvent = {
      id: randomUUID(),
      emailCampaignId: input.emailCampaignId,
      recipientHash: input.recipientHash,
      type: input.type,
      url: input.url,
      occurredAt: now,
    };

    const list = this.events.get(input.emailCampaignId) ?? [];
    list.push(event);
    this.events.set(input.emailCampaignId, list);

    return event;
  }

  /**
   * Compute open-rate and click-rate analytics for a sent email campaign.
   * Returns a zeroed analytics object for campaigns that have not been sent.
   */
  getAnalytics(id: string): EmailCampaignAnalytics {
    const campaign = this.getById(id);
    const recipientCount = campaign?.sendRecord?.recipientCount ?? 0;
    const allEvents = this.events.get(id) ?? [];

    const opens = allEvents.filter((e) => e.type === "open");
    const clicks = allEvents.filter((e) => e.type === "click");

    const uniqueOpens = new Set(opens.map((e) => e.recipientHash)).size;
    const uniqueClicks = new Set(clicks.map((e) => e.recipientHash)).size;

    // Tally clicks by URL
    const urlCounts = new Map<string, number>();
    for (const click of clicks) {
      if (click.url) {
        urlCounts.set(click.url, (urlCounts.get(click.url) ?? 0) + 1);
      }
    }
    const topLinks = [...urlCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([url, count]) => ({ url, clicks: count }));

    return {
      emailCampaignId: id,
      recipientCount,
      uniqueOpens,
      totalOpens: opens.length,
      uniqueClicks,
      totalClicks: clicks.length,
      openRate: recipientCount > 0 ? Math.round((uniqueOpens / recipientCount) * 10000) / 100 : 0,
      clickRate: recipientCount > 0 ? Math.round((uniqueClicks / recipientCount) * 10000) / 100 : 0,
      topLinks,
      lastUpdatedAt: allEvents.length > 0 ? Math.max(...allEvents.map((e) => e.occurredAt)) : Date.now(),
    };
  }

  /** Expose raw events for testing and data-export purposes. */
  getEvents(emailCampaignId: string): EmailTrackingEvent[] {
    return [...(this.events.get(emailCampaignId) ?? [])];
  }
}

/** Module-level singleton — mirrors the pattern used across this codebase. */
export const emailCampaignService = new EmailCampaignService();
