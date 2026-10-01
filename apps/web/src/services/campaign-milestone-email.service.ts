/**
 * CampaignMilestoneEmailService — Issue #915
 *
 * Notifies **sponsors** (backers) of a campaign when a funding milestone is
 * crossed (25 %, 50 %, 75 %, 100 %). Notifications include a full impact
 * metrics card (trees planted / verified, CO₂ offset, sponsor count,
 * raised / goal amounts).
 *
 * Architecture
 * ────────────
 * The service is intentionally thin: it converts the numeric milestone
 * percentages returned by `recordCampaignContribution` into the milestone-key
 * strings used by the notification-schedule layer, builds the impact-metrics
 * payload, then calls the notification-preferences service directly (in-process,
 * no HTTP round-trip). This keeps the flow synchronous with the contribution
 * request and avoids the need for an external HTTP call to
 * `POST /api/notifications/dispatch` from within the same process.
 *
 * The creator email is still handled by `recordCampaignContribution` itself
 * (issue #793); this service handles only sponsor (backer) notifications.
 */

import { EmailService } from "./email.service";
import { getPreferencesForCampaign } from "./notification-preferences.service";
import {
  milestoneEmailHtml,
  percentageToMilestoneKey,
  type MilestoneEmailImpactMetrics,
} from "./campaign.service";

/** Conservative CO₂ sequestration estimate used throughout the platform. */
const CO2_KG_PER_TREE_PER_YEAR = 20;

export interface MilestoneNotificationCampaign {
  id: string;
  name: string;
  treeCount: number;
  /** Number of independently verified trees (on-chain). */
  verifiedTreeCount?: number;
  co2Sequestration?: string;
  sponsorCount: number;
  raisedAmount: string;
  goalAmount: string;
  location?: string;
}

export interface MilestoneNotificationResult {
  /** Milestone percentage that triggered this batch (e.g. 50). */
  percentage: number;
  /** Stable key for this milestone (e.g. "50_percent", "goal_reached"). */
  milestoneKey: string;
  /** Number of sponsor emails successfully dispatched. */
  sent: number;
  /** Number of failures (best-effort; never throws). */
  failed: number;
}

/**
 * Encapsulates sponsor milestone notification dispatch for issue #915.
 *
 * Inject a custom `emailService` in tests to assert on sent messages without
 * actually delivering email.
 */
export class CampaignMilestoneEmailService {
  private readonly emailService: EmailService;

  constructor(emailService: EmailService = new EmailService()) {
    this.emailService = emailService;
  }

  /**
   * Notify all sponsors of `campaign` for every percentage in `milestones`.
   *
   * - Only sponsors with `channel === "email"` and a valid `email` field
   *   receive a message; push-channel sponsors are skipped (push provider
   *   is not yet wired, consistent with the dispatch route behaviour).
   * - Each milestone percentage is dispatched independently so a partial
   *   failure on one milestone does not suppress others.
   * - Failures are logged and counted but never thrown — the caller (the
   *   contribution route) must never fail a successful contribution because
   *   of a notification error.
   *
   * @returns One result entry per milestone percentage.
   */
  async notifySponsors(
    campaign: MilestoneNotificationCampaign,
    milestones: number[],
  ): Promise<MilestoneNotificationResult[]> {
    if (milestones.length === 0) return [];

    // Fetch preferences once; all milestone loops reuse the same list.
    const allPrefs = await getPreferencesForCampaign(campaign.id);
    const emailPrefs = allPrefs.filter((p) => p.channel === "email" && !!p.email);

    if (emailPrefs.length === 0) return [];

    // Build the impact metrics payload shared across all milestone emails for
    // this contribution event.
    const co2OffsetKg =
      campaign.co2Sequestration !== undefined && /^\d+(?:\.\d+)?$/.test(campaign.co2Sequestration)
        ? parseFloat(campaign.co2Sequestration) * 1_000 // metric tonnes → kg
        : campaign.treeCount * CO2_KG_PER_TREE_PER_YEAR;

    const impactMetrics: MilestoneEmailImpactMetrics = {
      treeCount: campaign.treeCount,
      verifiedTreeCount: campaign.verifiedTreeCount,
      co2OffsetKg,
      sponsorCount: campaign.sponsorCount,
      raisedAmount: campaign.raisedAmount,
      goalAmount: campaign.goalAmount,
      location: campaign.location,
    };

    const results: MilestoneNotificationResult[] = [];

    for (const percentage of milestones) {
      const milestoneKey = percentageToMilestoneKey(percentage);
      if (!milestoneKey) {
        console.warn(
          `[CampaignMilestoneEmailService] Unknown milestone percentage ${percentage} for campaign ${campaign.id} — skipping`,
        );
        continue;
      }

      const milestoneLabels: Record<string, string> = {
        "25_percent": "25% funded 🌱",
        "50_percent": "Halfway there — 50% funded 🌳",
        "75_percent": "75% funded 🌿",
        goal_reached: "Goal reached! 🎉",
      };
      const label = milestoneLabels[milestoneKey] ?? `${percentage}% milestone reached`;

      const subject = `${campaign.name}: ${label}`;
      const html = milestoneEmailHtml(campaign.name, percentage, impactMetrics, "sponsor");

      let sent = 0;
      let failed = 0;

      for (const prefs of emailPrefs) {
        try {
          await this.emailService.sendEmail({ to: prefs.email!, subject, html });
          sent++;
        } catch (err) {
          failed++;
          console.error(
            `[CampaignMilestoneEmailService] Failed to email sponsor ${prefs.sponsorId} for ${campaign.id} @ ${percentage}%:`,
            err,
          );
        }
      }

      console.log(
        `[CampaignMilestoneEmailService] ${campaign.id} @ ${percentage}%: sent=${sent} failed=${failed}`,
      );

      results.push({ percentage, milestoneKey, sent, failed });
    }

    return results;
  }
}
