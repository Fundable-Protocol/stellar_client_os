/**
 * Campaign Pre-Launch & Waitlist Service — Issue #1358
 *
 * Coordinates pre-launch teaser state, real-time email waitlist subscriptions,
 * social proof metrics, and automated email/push broadcasts when transitioning
 * campaigns from PRE_LAUNCH to ACTIVE.
 */

import { randomUUID } from "crypto";
import { EmailService } from "@/services/email.service";
import { pushNotificationService } from "@/services/push-notification.service";
import { followService } from "@/services/campaign-follow.service";
import {
  getCampaign,
  transitionCampaignStatus,
  type CampaignRecord,
} from "@/services/campaign.service";
import {
  PreLaunchSubscriber,
  PreLaunchStats,
  PreLaunchSubscriptionInput,
  PreLaunchTransitionResult,
} from "@/types/campaign-prelaunch";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CampaignPreLaunchService {
  private waitlists = new Map<string, PreLaunchSubscriber[]>();

  /**
   * Subscribe an email to the pre-launch waitlist.
   */
  subscribe(input: PreLaunchSubscriptionInput): {
    subscriber: PreLaunchSubscriber;
    stats: PreLaunchStats;
    isNew: boolean;
  } {
    const campaignId = input.campaignId?.trim();
    if (!campaignId) throw new Error("campaignId is required");

    const email = input.email?.trim().toLowerCase();
    if (!email || !EMAIL_PATTERN.test(email)) {
      throw new Error("A valid email address is required");
    }

    const current = this.waitlists.get(campaignId) || [];
    let existing = current.find((s) => s.email.toLowerCase() === email);
    let isNew = false;

    if (existing) {
      existing.active = true;
      if (input.walletAddress) {
        existing.walletAddress = input.walletAddress.trim();
      }
    } else {
      isNew = true;
      existing = {
        id: `waitlist_${randomUUID().replaceAll("-", "").slice(0, 16)}`,
        campaignId,
        email,
        walletAddress: input.walletAddress?.trim(),
        subscribedAt: Date.now(),
        active: true,
      };
      current.push(existing);
      this.waitlists.set(campaignId, current);
    }

    // Also register in followService so existing follow feeds/counts reflect the waitlist subscriber
    try {
      followService.follow({
        campaignId,
        email,
        walletAddress: input.walletAddress,
        preferences: {
          milestoneUpdates: true,
          verificationUpdates: true,
          completionUpdates: true,
        },
      });
    } catch {
      // Best-effort follow integration
    }

    const stats = this.getStats(campaignId);

    return {
      subscriber: existing,
      stats,
      isNew,
    };
  }

  /**
   * Unsubscribe from the waitlist.
   */
  unsubscribe(campaignId: string, email: string): boolean {
    const normalized = email?.trim().toLowerCase();
    const current = this.waitlists.get(campaignId) || [];
    const item = current.find((s) => s.email.toLowerCase() === normalized);
    if (!item) return false;
    item.active = false;
    return true;
  }

  /**
   * Returns all active subscribers for a campaign.
   */
  getSubscribers(campaignId: string): PreLaunchSubscriber[] {
    return (this.waitlists.get(campaignId) || []).filter((s) => s.active);
  }

  /**
   * Computes real-time follower count and social proof statistics.
   */
  getStats(campaignId: string, target = 100): PreLaunchStats {
    const activeSubscribers = this.getSubscribers(campaignId);
    const count = activeSubscribers.length;
    const progressPercent = Math.min(Math.round((count / target) * 100), 100);

    // Approximate recent week growth
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const weeklyGrowth = activeSubscribers.filter((s) => s.subscribedAt >= oneWeekAgo).length;

    return {
      campaignId,
      subscriberCount: count,
      targetSubscribers: target,
      progressPercent,
      weeklyGrowth,
      isPreLaunch: true,
    };
  }

  /**
   * Transitions campaign from PRE_LAUNCH to ACTIVE and triggers automated
   * email and push notification broadcasts to all followers the moment it goes live.
   */
  async transitionToActiveAndBroadcast(
    campaignId: string,
    actorAddress = "system",
    emailService = new EmailService()
  ): Promise<PreLaunchTransitionResult> {
    const campaign = await getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign not found: ${campaignId}`);
    }

    const previousStatus = campaign.status;

    // Transition status to ACTIVE if not already active
    let updatedCampaign = campaign;
    if (campaign.status !== "ACTIVE") {
      updatedCampaign = await transitionCampaignStatus(
        campaign,
        "ACTIVE",
        actorAddress,
        "Campaign transitioned from Pre-Launch to Active"
      );
    }

    const subscribers = this.getSubscribers(campaignId);
    const now = Date.now();
    let emailsSent = 0;
    let pushNotificationsSent = 0;

    // Automated email broadcast to all followers
    const emailPromises = subscribers.map(async (sub) => {
      try {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://fundable.org";
        const campaignUrl = `${appUrl}/campaigns/${encodeURIComponent(campaign.id)}`;

        const emailHtml = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090b; color: #f4f4f5; border-radius: 12px; border: 1px solid #27272a;">
            <div style="text-align: center; margin-bottom: 24px;">
              <span style="background: #581c87; color: #d8b4fe; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase;">🚀 Campaign is Live!</span>
              <h1 style="color: #ffffff; font-size: 24px; margin-top: 16px; margin-bottom: 8px;">${campaign.name} is Now Accepting Pledges!</h1>
              <p style="color: #a1a1aa; font-size: 14px; margin: 0;">You joined the pre-launch waitlist — now is your chance to back the project on Day One.</p>
            </div>

            <div style="background: #18181b; padding: 20px; border-radius: 8px; border: 1px solid #27272a; margin-bottom: 24px;">
              <p style="color: #e4e4e7; font-size: 14px; line-height: 1.5; margin: 0;">${campaign.description || "The campaign has officially launched on Stellar."}</p>
              <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #27272a; display: flex; justify-content: space-between;">
                <div>
                  <span style="font-size: 12px; color: #71717a;">Funding Goal</span><br/>
                  <strong style="font-size: 16px; color: #c084fc;">${campaign.goalAmount} XLM</strong>
                </div>
              </div>
            </div>

            <div style="text-align: center; margin-bottom: 24px;">
              <a href="${campaignUrl}" style="display: inline-block; background: #7c3aed; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 15px; padding: 12px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(124, 58, 237, 0.4);">
                Back This Campaign Now &rarr;
              </a>
            </div>

            <p style="text-align: center; font-size: 11px; color: #52525b; margin: 0;">
              You received this email because you subscribed to the launch waitlist for ${campaign.name}.
            </p>
          </div>
        `;

        const sent = await emailService.sendEmail({
          to: sub.email,
          subject: `🚀 "${campaign.name}" is NOW LIVE on Fundable!`,
          html: emailHtml,
        });

        if (sent) {
          sub.notifiedAt = now;
          emailsSent++;
        }
      } catch (err) {
        console.error(`[Pre-Launch] Failed to send launch email to ${sub.email}:`, err);
      }
    });

    await Promise.all(emailPromises);

    // Automated push notification broadcast
    try {
      await pushNotificationService.notifyMilestone(
        campaign.id,
        campaign.name,
        "campaign launched",
        campaign.creator
      );
      pushNotificationsSent++;
    } catch (err) {
      console.warn("[Pre-Launch] Push broadcast notice failed:", err);
    }

    return {
      success: true,
      campaignId: campaign.id,
      previousStatus,
      newStatus: updatedCampaign.status,
      broadcastCount: emailsSent + pushNotificationsSent,
      emailsSent,
      pushNotificationsSent,
      transitionedAt: now,
    };
  }

  reset(): void {
    this.waitlists.clear();
  }
}

export const campaignPrelaunchService = new CampaignPreLaunchService();
