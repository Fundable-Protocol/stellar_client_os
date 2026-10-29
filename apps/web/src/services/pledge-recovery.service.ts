import { createHash, randomBytes } from "node:crypto";
import { campaignInstalmentsService } from "@/services/campaign-instalments.service";
import { getCampaign } from "@/services/campaign.service";
import { EmailService } from "@/services/email.service";
import { getRedisClient } from "@/lib/redis";
import { isSupportedPlanMonths, type InstalmentPlanMonths } from "@/types/campaign-instalments";

const KEY_PREFIX = "pledge-recovery:intent:";
const DUE_INDEX = "pledge-recovery:due";
const TOKEN_PREFIX = "pledge-recovery:token:";
const REMINDER_DELAY_MS = 60 * 60 * 1000;
const INTENT_TTL_SECONDS = 30 * 24 * 60 * 60;

interface PledgeRecoveryIntent {
  id: string;
  recoveryToken: string;
  optOutToken: string;
  campaignId: string;
  tierId: string;
  backerAddress: string;
  backerEmail: string;
  planMonths: InstalmentPlanMonths;
  updatedAt: number;
  reminderSentAt?: number;
  completedAt?: number;
  optedOutAt?: number;
}

export interface PledgeRecoveryDetails {
  campaignId: string;
  tierId: string;
  planMonths: InstalmentPlanMonths;
  backerEmail: string;
}

function intentId(campaignId: string, backerAddress: string, backerEmail: string): string {
  return createHash("sha256")
    .update(`${campaignId}:${backerAddress.toLowerCase()}:${backerEmail.toLowerCase()}`)
    .digest("hex");
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function recoveryUrl(campaignId: string, token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fundable.network";
  const url = new URL(`/campaigns/${encodeURIComponent(campaignId)}`, baseUrl);
  url.searchParams.set("pledgeRecovery", token);
  return url.toString();
}

function optOutUrl(token: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL ?? "https://fundable.network";
  const url = new URL("/pledge-recovery/opt-out", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

export class PledgeRecoveryService {
  constructor(private readonly emailService = new EmailService()) {}

  private redis() {
    const redis = getRedisClient();
    if (!redis) throw new Error("Pledge recovery requires REDIS_URL to be configured.");
    return redis;
  }

  private async getIntent(id: string): Promise<PledgeRecoveryIntent | null> {
    const value = await this.redis().get(`${KEY_PREFIX}${id}`);
    return value ? JSON.parse(value) as PledgeRecoveryIntent : null;
  }

  async trackCheckout(input: {
    campaignId: string;
    tierId: string;
    backerAddress: string;
    backerEmail: string;
    planMonths: number;
  }): Promise<void> {
    const campaignId = input.campaignId.trim();
    const tierId = input.tierId.trim();
    const backerAddress = input.backerAddress.trim();
    const backerEmail = input.backerEmail.trim().toLowerCase();
    if (!campaignId || !tierId || !backerAddress) throw new Error("Campaign, reward tier, and connected wallet are required.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(backerEmail)) throw new Error("Enter a valid notification email to receive a checkout reminder.");
    if (!isSupportedPlanMonths(input.planMonths)) throw new Error("Plan duration must be 2, 3, or 6 months.");

    const campaign = await getCampaign(campaignId);
    if (!campaign) throw new Error("Campaign not found.");
    const tier = campaignInstalmentsService.getRewardTier(campaignId, tierId);
    if (!tier || !tier.instalmentEnabled) throw new Error("This reward tier does not offer instalment checkout.");
    if (tier.allowedPlanMonths?.length && !tier.allowedPlanMonths.includes(input.planMonths)) {
      throw new Error("This instalment plan is not available for the selected reward tier.");
    }

    const redis = this.redis();
    const id = intentId(campaignId, backerAddress, backerEmail);
    const existing = await this.getIntent(id);
    const intent: PledgeRecoveryIntent = {
      id,
      recoveryToken: existing?.recoveryToken ?? randomBytes(32).toString("hex"),
      optOutToken: existing?.optOutToken ?? randomBytes(32).toString("hex"),
      campaignId,
      tierId,
      backerAddress,
      backerEmail,
      planMonths: input.planMonths,
      updatedAt: Date.now(),
    };
    await redis.setex(`${KEY_PREFIX}${id}`, INTENT_TTL_SECONDS, JSON.stringify(intent));
    await redis.setex(`${TOKEN_PREFIX}${intent.recoveryToken}`, INTENT_TTL_SECONDS, id);
    await redis.setex(`${TOKEN_PREFIX}${intent.optOutToken}`, INTENT_TTL_SECONDS, id);
    await redis.zadd(DUE_INDEX, intent.updatedAt + REMINDER_DELAY_MS, id);
  }

  async getRecoveryDetails(token: string): Promise<PledgeRecoveryDetails | null> {
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const redis = this.redis();
    const id = await redis.get(`${TOKEN_PREFIX}${token}`);
    if (!id) return null;
    const intent = await this.getIntent(id);
    if (!intent || intent.recoveryToken !== token || intent.completedAt || intent.optedOutAt) return null;
    return {
      campaignId: intent.campaignId,
      tierId: intent.tierId,
      planMonths: intent.planMonths,
      backerEmail: intent.backerEmail,
    };
  }

  async completeCheckout(campaignId: string, backerAddress: string, backerEmail?: string): Promise<void> {
    if (!backerEmail) return;
    const id = intentId(campaignId.trim(), backerAddress.trim(), backerEmail.trim().toLowerCase());
    const redis = this.redis();
    const intent = await this.getIntent(id);
    if (!intent) return;
    intent.completedAt = Date.now();
    await redis.setex(`${KEY_PREFIX}${id}`, INTENT_TTL_SECONDS, JSON.stringify(intent));
    await redis.zrem(DUE_INDEX, id);
  }

  async cancelCheckout(campaignId: string, backerAddress: string, backerEmail: string): Promise<void> {
    const id = intentId(campaignId.trim(), backerAddress.trim(), backerEmail.trim().toLowerCase());
    const redis = this.redis();
    const intent = await this.getIntent(id);
    if (!intent) return;
    intent.optedOutAt = Date.now();
    await redis.setex(`${KEY_PREFIX}${id}`, INTENT_TTL_SECONDS, JSON.stringify(intent));
    await redis.zrem(DUE_INDEX, id);
  }

  async optOut(token: string): Promise<boolean> {
    if (!/^[a-f0-9]{64}$/.test(token)) return false;
    const redis = this.redis();
    const id = await redis.get(`${TOKEN_PREFIX}${token}`);
    if (!id) return false;
    const intent = await this.getIntent(id);
    if (!intent || intent.optOutToken !== token) return false;
    intent.optedOutAt = Date.now();
    await redis.setex(`${KEY_PREFIX}${id}`, INTENT_TTL_SECONDS, JSON.stringify(intent));
    await redis.zrem(DUE_INDEX, id);
    return true;
  }

  async sendDueReminders(now = Date.now()): Promise<{ sent: number; skipped: number }> {
    const redis = this.redis();
    const dueIds = await redis.zrangebyscore(DUE_INDEX, "-inf", now, "LIMIT", 0, 100);
    let sent = 0;
    let skipped = 0;

    for (const id of dueIds) {
      const lockKey = `${KEY_PREFIX}lock:${id}`;
      const lock = await redis.set(lockKey, "1", "EX", 120, "NX");
      if (lock !== "OK") continue;
      try {
        const intent = await this.getIntent(id);
        if (!intent || intent.completedAt || intent.optedOutAt || intent.reminderSentAt) {
          await redis.zrem(DUE_INDEX, id);
          skipped++;
          continue;
        }
        if (intent.updatedAt + REMINDER_DELAY_MS > now) continue;

        const campaign = await getCampaign(intent.campaignId);
        const tier = campaignInstalmentsService.getRewardTier(intent.campaignId, intent.tierId);
        if (!campaign || !tier) {
          await redis.zrem(DUE_INDEX, id);
          skipped++;
          continue;
        }

        const campaignLink = htmlEscape(recoveryUrl(intent.campaignId, intent.recoveryToken));
        const unsubscribeLink = htmlEscape(optOutUrl(intent.optOutToken));
        const plan = `${intent.planMonths}-month instalment plan`;
        const html = [
          '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;line-height:1.6">',
          `<p>You started checkout for the ${htmlEscape(tier.name)} reward tier in ${htmlEscape(campaign.name)}.</p>`,
          `<p>Your selection: ${htmlEscape(tier.amount)} ${htmlEscape(tier.token)} on a ${htmlEscape(plan)}.</p>`,
          `<p><a href="${campaignLink}">Continue your pledge</a></p>`,
          `<p style="font-size:12px;color:#666">If you no longer want checkout reminders, <a href="${unsubscribeLink}">opt out here</a>.</p>`,
          "</div>",
        ].join("");
        const delivered = await this.emailService.sendEmail({
          to: intent.backerEmail,
          subject: `Finish your pledge to ${campaign.name}`,
          html,
        });
        if (delivered) {
          intent.reminderSentAt = now;
          await redis.setex(`${KEY_PREFIX}${id}`, INTENT_TTL_SECONDS, JSON.stringify(intent));
          await redis.zrem(DUE_INDEX, id);
          sent++;
        }
      } catch (error) {
        console.error(`[pledge-recovery] Failed to send reminder for checkout ${id}:`, error);
      } finally {
        await redis.del(lockKey);
      }
    }

    return { sent, skipped };
  }
}

export const pledgeRecoveryService = new PledgeRecoveryService();
