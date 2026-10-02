import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  CampaignPushSubscription,
  CampaignMilestoneType,
  MilestoneNotificationPayload,
  DeliveredPushNotification,
  DeviceType,
  PushSubscriptionKeys,
} from '../types/campaign-notification';

export interface CampaignPushServiceOptions {
  dataDir?: string;
  pushSender?: (
    subscription: CampaignPushSubscription,
    payload: { title: string; body: string; data: Record<string, unknown> }
  ) => Promise<boolean>;
}

export class CampaignPushNotificationService {
  private readonly subscriptionsPath: string;
  private readonly notificationsPath: string;
  private readonly pushSender?: (
    subscription: CampaignPushSubscription,
    payload: { title: string; body: string; data: Record<string, unknown> }
  ) => Promise<boolean>;

  constructor(options: CampaignPushServiceOptions = {}) {
    const dataDir = options.dataDir ?? path.join(process.cwd(), 'data');
    this.subscriptionsPath = path.join(dataDir, 'mobile_push_subscriptions.json');
    this.notificationsPath = path.join(dataDir, 'mobile_push_delivered.json');
    this.pushSender = options.pushSender;
  }

  private async writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    const tempPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
      await fs.rename(tempPath, filePath);
    } catch (err) {
      try {
        await fs.unlink(tempPath);
      } catch {}
      throw err;
    }
  }

  async getSubscriptions(): Promise<CampaignPushSubscription[]> {
    try {
      const data = await fs.readFile(this.subscriptionsPath, 'utf-8');
      return JSON.parse(data) as CampaignPushSubscription[];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return [];
      throw err;
    }
  }

  async getDeliveredNotifications(): Promise<DeliveredPushNotification[]> {
    try {
      const data = await fs.readFile(this.notificationsPath, 'utf-8');
      return JSON.parse(data) as DeliveredPushNotification[];
    } catch (err: unknown) {
      if ((err as { code?: string }).code === 'ENOENT') return [];
      throw err;
    }
  }

  async registerSubscription(input: {
    subscriberAddress: string;
    campaignId?: string;
    endpoint: string;
    keys: PushSubscriptionKeys;
    deviceType?: DeviceType;
    enabledMilestones?: CampaignMilestoneType[];
  }): Promise<CampaignPushSubscription> {
    if (!input.subscriberAddress || !input.endpoint || !input.keys?.auth || !input.keys?.p256dh) {
      throw new Error('Invalid push subscription: subscriberAddress, endpoint, and keys are required');
    }

    const subscriptions = await this.getSubscriptions();
    const existingIndex = subscriptions.findIndex((s) => s.endpoint === input.endpoint);

    const now = new Date().toISOString();
    const defaultMilestones: CampaignMilestoneType[] = [
      'trees_planted',
      'verification_complete',
      'campaign_finished',
      'impact_achieved',
    ];

    if (existingIndex >= 0) {
      const existing = subscriptions[existingIndex];
      const updated: CampaignPushSubscription = {
        ...existing,
        subscriberAddress: input.subscriberAddress,
        campaignId: input.campaignId ?? existing.campaignId,
        deviceType: input.deviceType ?? existing.deviceType,
        enabledMilestones: input.enabledMilestones ?? existing.enabledMilestones,
        updatedAt: now,
      };
      subscriptions[existingIndex] = updated;
      await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
      return updated;
    }

    const newSub: CampaignPushSubscription = {
      id: `sub_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
      subscriberAddress: input.subscriberAddress,
      campaignId: input.campaignId ?? '*',
      endpoint: input.endpoint,
      keys: input.keys,
      deviceType: input.deviceType ?? 'unknown',
      enabledMilestones: input.enabledMilestones ?? defaultMilestones,
      createdAt: now,
      updatedAt: now,
    };

    subscriptions.push(newSub);
    await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    return newSub;
  }

  async unregisterSubscription(endpointOrId: string): Promise<boolean> {
    const subscriptions = await this.getSubscriptions();
    const filtered = subscriptions.filter(
      (s) => s.endpoint !== endpointOrId && s.id !== endpointOrId
    );
    if (filtered.length === subscriptions.length) {
      return false;
    }
    await this.writeJsonAtomic(this.subscriptionsPath, filtered);
    return true;
  }

  async updatePreferences(
    subscriberAddress: string,
    campaignId: string,
    enabledMilestones: CampaignMilestoneType[]
  ): Promise<CampaignPushSubscription[]> {
    const subscriptions = await this.getSubscriptions();
    const updatedList: CampaignPushSubscription[] = [];

    for (let i = 0; i < subscriptions.length; i++) {
      const sub = subscriptions[i];
      if (
        sub.subscriberAddress.toLowerCase() === subscriberAddress.toLowerCase() &&
        (campaignId === '*' || sub.campaignId === '*' || sub.campaignId === campaignId)
      ) {
        sub.enabledMilestones = enabledMilestones;
        sub.updatedAt = new Date().toISOString();
        updatedList.push(sub);
      }
    }

    if (updatedList.length > 0) {
      await this.writeJsonAtomic(this.subscriptionsPath, subscriptions);
    }

    return updatedList;
  }

  formatMilestoneContent(payload: MilestoneNotificationPayload): { title: string; body: string } {
    const name = payload.campaignTitle || `Campaign #${payload.campaignId}`;

    switch (payload.milestone) {
      case 'trees_planted': {
        const count = payload.details.treesPlanted ?? 'New';
        const target = payload.details.targetTrees ? ` of ${payload.details.targetTrees}` : '';
        return {
          title: `🌱 Milestone Reached: Trees Planted!`,
          body: `${name} has just reached ${count}${target} trees planted!`,
        };
      }
      case 'verification_complete': {
        return {
          title: `✅ Milestone: Verification Complete!`,
          body: `Verification for ${name} has been successfully validated and logged on-chain.`,
        };
      }
      case 'campaign_finished': {
        return {
          title: `🎉 Milestone: Campaign Finished!`,
          body: `${name} has completed all milestones and successfully finished!`,
        };
      }
      case 'impact_achieved': {
        const impact = payload.details.impactDescription ?? 'environmental targets achieved';
        return {
          title: `🌍 Milestone: Impact Achieved!`,
          body: `${name} has achieved its targeted impact: ${impact}.`,
        };
      }
    }
  }

  async sendMilestonePushNotification(
    payload: MilestoneNotificationPayload
  ): Promise<{ sentCount: number; errors: number; delivered: DeliveredPushNotification[] }> {
    const subscriptions = await this.getSubscriptions();
    const targetMilestone = payload.milestone;

    // Filter subscribers who sponsor this campaign (or all campaigns '*') and enabled this milestone
    const matchingSubs = subscriptions.filter((sub) => {
      const campaignMatches = sub.campaignId === '*' || sub.campaignId === payload.campaignId;
      const milestoneMatches = sub.enabledMilestones.includes(targetMilestone);
      return campaignMatches && milestoneMatches;
    });

    if (matchingSubs.length === 0) {
      return { sentCount: 0, errors: 0, delivered: [] };
    }

    const { title, body } = this.formatMilestoneContent(payload);
    const deepLinkUrl = payload.deepLinkUrl || `/campaigns/${payload.campaignId}`;
    const pushData = {
      campaignId: payload.campaignId,
      milestone: payload.milestone,
      deepLinkUrl,
      ...payload.details,
    };

    const deliveredRecords = await this.getDeliveredNotifications();
    const newDeliveries: DeliveredPushNotification[] = [];
    let sentCount = 0;
    let errors = 0;

    for (const sub of matchingSubs) {
      let success = true;
      let errorMsg: string | undefined;

      if (this.pushSender) {
        try {
          success = await this.pushSender(sub, { title, body, data: pushData });
        } catch (err: unknown) {
          success = false;
          errorMsg = err instanceof Error ? err.message : 'Push transmission failed';
        }
      }

      if (success) {
        sentCount++;
      } else {
        errors++;
      }

      const deliveryRecord: DeliveredPushNotification = {
        id: `ntf_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
        subscriptionId: sub.id,
        subscriberAddress: sub.subscriberAddress,
        campaignId: payload.campaignId,
        milestone: payload.milestone,
        title,
        body,
        data: pushData,
        sentAt: new Date().toISOString(),
        status: success ? 'sent' : 'failed',
        errorMessage: errorMsg,
      };

      newDeliveries.push(deliveryRecord);
      deliveredRecords.push(deliveryRecord);
    }

    await this.writeJsonAtomic(this.notificationsPath, deliveredRecords);

    return {
      sentCount,
      errors,
      delivered: newDeliveries,
    };
  }
}
