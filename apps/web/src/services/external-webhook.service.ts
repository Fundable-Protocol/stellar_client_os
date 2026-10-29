/**
 * External Webhook Service for Telegram and Discord
 *
 * Handles formatting and delivery of campaign events to creator-configured
 * Telegram bots and Discord channels.
 */

import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ExternalWebhookConfig,
  ExternalWebhookPlatform,
  ExternalWebhookEvent,
  TelegramMessage,
  DiscordWebhookPayload,
  DiscordEmbed,
  PledgeEventData,
  MilestoneEventData,
  StretchGoalEventData,
  RefundEventData,
} from "../types/external-webhook";

export interface ExternalWebhookServiceOptions {
  storageePath?: string;
}

export class ExternalWebhookService {
  private readonly storagePath: string;

  constructor(options: ExternalWebhookServiceOptions = {}) {
    this.storagePath =
      options.storageePath ?? path.join(process.cwd(), "data", "external_webhooks.json");
  }

  // ============================================
  // Storage Methods
  // ============================================

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), "utf-8");
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  async getWebhooks(campaignId?: string): Promise<ExternalWebhookConfig[]> {
    try {
      const data = await fs.readFile(this.storagePath, "utf-8");
      const webhooks = JSON.parse(data) as ExternalWebhookConfig[];
      return campaignId ? webhooks.filter((w) => w.campaignId === campaignId) : webhooks;
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT") {
        return [];
      }
      throw err;
    }
  }

  async createWebhook(
    campaignId: string,
    platform: ExternalWebhookPlatform,
    webhookUrl: string,
    events: ExternalWebhookEvent[],
    options: { botToken?: string; enabled?: boolean } = {}
  ): Promise<ExternalWebhookConfig> {
    // Validate URL
    try {
      new URL(webhookUrl);
    } catch {
      throw new Error("Invalid webhook URL format");
    }

    // Validate platform-specific requirements
    if (platform === "telegram" && !options.botToken) {
      throw new Error("Telegram webhooks require a bot token");
    }

    if (platform === "discord" && !webhookUrl.includes("discord.com/api/webhooks/")) {
      throw new Error("Invalid Discord webhook URL");
    }

    if (events.length === 0) {
      throw new Error("At least one event must be specified");
    }

    const webhooks = await this.getWebhooks();
    const newWebhook: ExternalWebhookConfig = {
      id: "ewh_" + randomUUID().replace(/-/g, "").slice(0, 16),
      campaignId,
      platform,
      webhookUrl,
      ...(options.botToken && { botToken: options.botToken }),
      enabled: options.enabled !== undefined ? options.enabled : true,
      events,
      createdAt: new Date().toISOString(),
    };

    webhooks.push(newWebhook);
    await this.writeJsonAtomic(this.storagePath, webhooks);
    return newWebhook;
  }

  async updateWebhook(
    id: string,
    patch: Partial<Pick<ExternalWebhookConfig, "webhookUrl" | "events" | "enabled" | "botToken">>
  ): Promise<ExternalWebhookConfig | null> {
    const webhooks = await this.getWebhooks();
    const index = webhooks.findIndex((w) => w.id === id);
    if (index === -1) return null;

    const updated: ExternalWebhookConfig = {
      ...webhooks[index],
      ...Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)),
      updatedAt: new Date().toISOString(),
    };

    webhooks[index] = updated;
    await this.writeJsonAtomic(this.storagePath, webhooks);
    return updated;
  }

  async deleteWebhook(id: string): Promise<boolean> {
    const webhooks = await this.getWebhooks();
    const index = webhooks.findIndex((w) => w.id === id);
    if (index === -1) return false;

    webhooks.splice(index, 1);
    await this.writeJsonAtomic(this.storagePath, webhooks);
    return true;
  }

  // ============================================
  // Event Dispatch Methods
  // ============================================

  async dispatchPledge(eventData: PledgeEventData): Promise<void> {
    const webhooks = await this.getWebhooks(eventData.campaignId);
    const activeWebhooks = webhooks.filter(
      (w) => w.enabled && w.events.includes("pledge.created")
    );

    await Promise.all(
      activeWebhooks.map((webhook) =>
        this.sendPledgeEvent(webhook, eventData).catch((err) =>
          console.error(`Failed to send pledge event to ${webhook.platform}:`, err)
        )
      )
    );
  }

  async dispatchMilestone(eventData: MilestoneEventData): Promise<void> {
    const webhooks = await this.getWebhooks(eventData.campaignId);
    const activeWebhooks = webhooks.filter(
      (w) => w.enabled && w.events.includes("milestone.reached")
    );

    await Promise.all(
      activeWebhooks.map((webhook) =>
        this.sendMilestoneEvent(webhook, eventData).catch((err) =>
          console.error(`Failed to send milestone event to ${webhook.platform}:`, err)
        )
      )
    );
  }

  async dispatchStretchGoal(eventData: StretchGoalEventData): Promise<void> {
    const webhooks = await this.getWebhooks(eventData.campaignId);
    const activeWebhooks = webhooks.filter(
      (w) => w.enabled && w.events.includes("stretch_goal.unlocked")
    );

    await Promise.all(
      activeWebhooks.map((webhook) =>
        this.sendStretchGoalEvent(webhook, eventData).catch((err) =>
          console.error(`Failed to send stretch goal event to ${webhook.platform}:`, err)
        )
      )
    );
  }

  async dispatchRefund(eventData: RefundEventData): Promise<void> {
    const webhooks = await this.getWebhooks(eventData.campaignId);
    const activeWebhooks = webhooks.filter(
      (w) => w.enabled && w.events.includes("refund.requested")
    );

    await Promise.all(
      activeWebhooks.map((webhook) =>
        this.sendRefundEvent(webhook, eventData).catch((err) =>
          console.error(`Failed to send refund event to ${webhook.platform}:`, err)
        )
      )
    );
  }

  // ============================================
  // Platform-Specific Formatters & Senders
  // ============================================

  private async sendPledgeEvent(
    webhook: ExternalWebhookConfig,
    data: PledgeEventData
  ): Promise<void> {
    if (webhook.platform === "telegram") {
      await this.sendTelegramPledge(webhook, data);
    } else if (webhook.platform === "discord") {
      await this.sendDiscordPledge(webhook, data);
    }
  }

  private async sendMilestoneEvent(
    webhook: ExternalWebhookConfig,
    data: MilestoneEventData
  ): Promise<void> {
    if (webhook.platform === "telegram") {
      await this.sendTelegramMilestone(webhook, data);
    } else if (webhook.platform === "discord") {
      await this.sendDiscordMilestone(webhook, data);
    }
  }

  private async sendStretchGoalEvent(
    webhook: ExternalWebhookConfig,
    data: StretchGoalEventData
  ): Promise<void> {
    if (webhook.platform === "telegram") {
      await this.sendTelegramStretchGoal(webhook, data);
    } else if (webhook.platform === "discord") {
      await this.sendDiscordStretchGoal(webhook, data);
    }
  }

  private async sendRefundEvent(
    webhook: ExternalWebhookConfig,
    data: RefundEventData
  ): Promise<void> {
    if (webhook.platform === "telegram") {
      await this.sendTelegramRefund(webhook, data);
    } else if (webhook.platform === "discord") {
      await this.sendDiscordRefund(webhook, data);
    }
  }

  // Telegram Senders
  private async sendTelegramPledge(
    webhook: ExternalWebhookConfig,
    data: PledgeEventData
  ): Promise<void> {
    const chatId = this.extractTelegramChatId(webhook.webhookUrl);
    const message: TelegramMessage = {
      chat_id: chatId,
      parse_mode: "HTML",
      text: this.formatTelegramPledge(data),
    };

    await this.postToTelegram(webhook.botToken!, message);
  }

  private async sendTelegramMilestone(
    webhook: ExternalWebhookConfig,
    data: MilestoneEventData
  ): Promise<void> {
    const chatId = this.extractTelegramChatId(webhook.webhookUrl);
    const message: TelegramMessage = {
      chat_id: chatId,
      parse_mode: "HTML",
      text: this.formatTelegramMilestone(data),
    };

    await this.postToTelegram(webhook.botToken!, message);
  }

  private async sendTelegramStretchGoal(
    webhook: ExternalWebhookConfig,
    data: StretchGoalEventData
  ): Promise<void> {
    const chatId = this.extractTelegramChatId(webhook.webhookUrl);
    const message: TelegramMessage = {
      chat_id: chatId,
      parse_mode: "HTML",
      text: this.formatTelegramStretchGoal(data),
    };

    await this.postToTelegram(webhook.botToken!, message);
  }

  private async sendTelegramRefund(
    webhook: ExternalWebhookConfig,
    data: RefundEventData
  ): Promise<void> {
    const chatId = this.extractTelegramChatId(webhook.webhookUrl);
    const message: TelegramMessage = {
      chat_id: chatId,
      parse_mode: "HTML",
      text: this.formatTelegramRefund(data),
    };

    await this.postToTelegram(webhook.botToken!, message);
  }

  // Discord Senders
  private async sendDiscordPledge(
    webhook: ExternalWebhookConfig,
    data: PledgeEventData
  ): Promise<void> {
    const embed = this.formatDiscordPledge(data);
    const payload: DiscordWebhookPayload = {
      embeds: [embed],
      username: "Fundable Campaign Bot",
    };

    await this.postToDiscord(webhook.webhookUrl, payload);
  }

  private async sendDiscordMilestone(
    webhook: ExternalWebhookConfig,
    data: MilestoneEventData
  ): Promise<void> {
    const embed = this.formatDiscordMilestone(data);
    const payload: DiscordWebhookPayload = {
      embeds: [embed],
      username: "Fundable Campaign Bot",
    };

    await this.postToDiscord(webhook.webhookUrl, payload);
  }

  private async sendDiscordStretchGoal(
    webhook: ExternalWebhookConfig,
    data: StretchGoalEventData
  ): Promise<void> {
    const embed = this.formatDiscordStretchGoal(data);
    const payload: DiscordWebhookPayload = {
      embeds: [embed],
      username: "Fundable Campaign Bot",
    };

    await this.postToDiscord(webhook.webhookUrl, payload);
  }

  private async sendDiscordRefund(
    webhook: ExternalWebhookConfig,
    data: RefundEventData
  ): Promise<void> {
    const embed = this.formatDiscordRefund(data);
    const payload: DiscordWebhookPayload = {
      embeds: [embed],
      username: "Fundable Campaign Bot",
    };

    await this.postToDiscord(webhook.webhookUrl, payload);
  }

  // ============================================
  // Message Formatters
  // ============================================

  private formatTelegramPledge(data: PledgeEventData): string {
    const backerDisplay = data.backerNickname || "Anonymous";
    const tierDisplay = data.pledgedTier ? ` at <b>${data.pledgedTier}</b> tier` : "";
    
    return `
🎉 <b>New Pledge Received!</b>

Campaign: <b>${data.campaignName}</b>
Backer: ${backerDisplay}${tierDisplay}
Pledge Amount: <b>${this.formatAmount(data.pledgeAmount)}</b>

📊 Campaign Progress:
• Total Raised: <b>${this.formatAmount(data.totalRaised)}</b> / ${this.formatAmount(data.goalAmount)}
• Progress: <b>${data.percentFunded.toFixed(1)}%</b>
• Backers: <b>${data.sponsorCount}</b>
${data.txHash ? `\n🔗 Transaction: <code>${data.txHash.slice(0, 16)}...</code>` : ""}
    `.trim();
  }

  private formatTelegramMilestone(data: MilestoneEventData): string {
    const emoji = data.percentage === 100 ? "🎯" : "📈";
    const message = data.percentage === 100 ? "FULLY FUNDED" : `${data.percentage}% Milestone Reached`;
    
    return `
${emoji} <b>${message}!</b>

Campaign: <b>${data.campaignName}</b>

📊 Campaign Stats:
• Total Raised: <b>${this.formatAmount(data.totalRaised)}</b> / ${this.formatAmount(data.goalAmount)}
• Backers: <b>${data.sponsorCount}</b>
• Progress: <b>${data.percentage}%</b>

${data.percentage === 100 ? "🎊 Congratulations! Your campaign is fully funded!" : "Keep the momentum going!"}
    `.trim();
  }

  private formatTelegramStretchGoal(data: StretchGoalEventData): string {
    return `
🚀 <b>Stretch Goal Unlocked!</b>

Campaign: <b>${data.campaignName}</b>
Stretch Goal: <b>${data.stretchGoalName}</b>

Goal Amount: <b>${this.formatAmount(data.stretchGoalAmount)}</b>
Total Raised: <b>${this.formatAmount(data.totalRaised)}</b>

🎉 Amazing work from the community!
    `.trim();
  }

  private formatTelegramRefund(data: RefundEventData): string {
    return `
⚠️ <b>Refund Requested</b>

Campaign: <b>${data.campaignName}</b>
Backer: <code>${data.backerAddress.slice(0, 8)}...${data.backerAddress.slice(-8)}</code>
Amount: <b>${this.formatAmount(data.refundAmount)}</b>

Reason: ${data.reason}
    `.trim();
  }

  private formatDiscordPledge(data: PledgeEventData): DiscordEmbed {
    const backerDisplay = data.backerNickname || "Anonymous Backer";
    const fields: DiscordEmbed["fields"] = [
      {
        name: "💰 Pledge Amount",
        value: this.formatAmount(data.pledgeAmount),
        inline: true,
      },
      {
        name: "📊 Total Raised",
        value: `${this.formatAmount(data.totalRaised)} / ${this.formatAmount(data.goalAmount)}`,
        inline: true,
      },
      {
        name: "👥 Backers",
        value: data.sponsorCount.toString(),
        inline: true,
      },
      {
        name: "📈 Progress",
        value: `${data.percentFunded.toFixed(1)}%`,
        inline: true,
      },
    ];

    if (data.pledgedTier) {
      fields.unshift({
        name: "🎁 Tier",
        value: data.pledgedTier,
        inline: true,
      });
    }

    return {
      title: "🎉 New Pledge Received!",
      description: `**${backerDisplay}** just backed **${data.campaignName}**`,
      color: 0x5865f2, // Discord blurple
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: "Fundable Protocol",
      },
    };
  }

  private formatDiscordMilestone(data: MilestoneEventData): DiscordEmbed {
    const emoji = data.percentage === 100 ? "🎯" : "📈";
    const title = data.percentage === 100 ? "Campaign Fully Funded!" : `${data.percentage}% Milestone Reached!`;
    const color = data.percentage === 100 ? 0x57f287 : 0xfee75c; // Green or yellow

    return {
      title: `${emoji} ${title}`,
      description: `**${data.campaignName}** has reached ${data.percentage}% of its funding goal!`,
      color,
      fields: [
        {
          name: "💰 Total Raised",
          value: this.formatAmount(data.totalRaised),
          inline: true,
        },
        {
          name: "🎯 Goal",
          value: this.formatAmount(data.goalAmount),
          inline: true,
        },
        {
          name: "👥 Backers",
          value: data.sponsorCount.toString(),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Fundable Protocol",
      },
    };
  }

  private formatDiscordStretchGoal(data: StretchGoalEventData): DiscordEmbed {
    return {
      title: "🚀 Stretch Goal Unlocked!",
      description: `**${data.campaignName}** has unlocked a stretch goal: **${data.stretchGoalName}**`,
      color: 0xeb459e, // Pink
      fields: [
        {
          name: "🎯 Stretch Goal Amount",
          value: this.formatAmount(data.stretchGoalAmount),
          inline: true,
        },
        {
          name: "💰 Total Raised",
          value: this.formatAmount(data.totalRaised),
          inline: true,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Fundable Protocol • Amazing community support!",
      },
    };
  }

  private formatDiscordRefund(data: RefundEventData): DiscordEmbed {
    return {
      title: "⚠️ Refund Requested",
      description: `A refund has been requested for **${data.campaignName}**`,
      color: 0xed4245, // Red
      fields: [
        {
          name: "💰 Amount",
          value: this.formatAmount(data.refundAmount),
          inline: true,
        },
        {
          name: "📝 Reason",
          value: data.reason || "No reason provided",
          inline: false,
        },
        {
          name: "👤 Backer",
          value: `\`${data.backerAddress.slice(0, 8)}...${data.backerAddress.slice(-8)}\``,
          inline: false,
        },
      ],
      timestamp: new Date().toISOString(),
      footer: {
        text: "Fundable Protocol",
      },
    };
  }

  // ============================================
  // HTTP Helpers
  // ============================================

  private async postToTelegram(botToken: string, message: TelegramMessage): Promise<void> {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
  }

  private async postToDiscord(webhookUrl: string, payload: DiscordWebhookPayload): Promise<void> {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${error}`);
    }
  }

  // ============================================
  // Test Webhook
  // ============================================

  async testWebhook(webhookId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const webhooks = await this.getWebhooks();
      const webhook = webhooks.find((w) => w.id === webhookId);
      if (!webhook) {
        return { success: false, error: "Webhook not found" };
      }

      const testData: PledgeEventData = {
        campaignId: webhook.campaignId,
        campaignName: "Test Campaign",
        backerNickname: "Test Backer",
        pledgedTier: "Early Bird",
        pledgeAmount: "100000000",
        totalRaised: "5000000000",
        goalAmount: "10000000000",
        sponsorCount: 42,
        percentFunded: 50,
      };

      await this.sendPledgeEvent(webhook, testData);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  }

  // ============================================
  // Utilities
  // ============================================

  private extractTelegramChatId(url: string): string {
    // Webhook URL format: https://t.me/bot<bot_token>?chat_id=<chat_id>
    // or just the chat ID directly
    try {
      const parsed = new URL(url);
      const chatId = parsed.searchParams.get("chat_id");
      if (chatId) return chatId;
    } catch {
      // Not a URL, assume it's the chat ID directly
    }
    return url;
  }

  private formatAmount(amount: string): string {
    const num = Number(amount) / 10000000; // Assuming 7 decimal places for Stellar
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }) + " XLM";
  }
}

// Singleton instance
export const externalWebhookService = new ExternalWebhookService();
