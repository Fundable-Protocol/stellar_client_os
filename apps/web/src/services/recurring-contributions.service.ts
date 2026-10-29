import {
  RecurringContributionSubscription,
  CreateRecurringSubscriptionInput,
  UpdateRecurringSubscriptionInput,
  CreatorRecurringRevenueReport,
  CreatorRecurringCampaignRevenue,
} from '@/types/recurring-contributions';
import { addCalendarMonthsUtc } from '@/lib/subscription-cadence';

export interface RecurringContributionDataSource {
  createSubscription(subscription: RecurringContributionSubscription): Promise<RecurringContributionSubscription>;
  getSubscription(id: string): Promise<RecurringContributionSubscription | null>;
  listSubscriptionsByBacker(backerAddress: string): Promise<RecurringContributionSubscription[]>;
  listSubscriptionsByCreator(creatorAddress: string): Promise<RecurringContributionSubscription[]>;
  updateSubscription(
    id: string,
    updates: Partial<RecurringContributionSubscription>
  ): Promise<RecurringContributionSubscription | null>;
}

export class InMemoryRecurringContributionDataSource implements RecurringContributionDataSource {
  private subscriptions: Map<string, RecurringContributionSubscription> = new Map();

  async createSubscription(subscription: RecurringContributionSubscription): Promise<RecurringContributionSubscription> {
    this.subscriptions.set(subscription.id, { ...subscription });
    return { ...subscription };
  }

  async getSubscription(id: string): Promise<RecurringContributionSubscription | null> {
    const sub = this.subscriptions.get(id);
    return sub ? { ...sub } : null;
  }

  async listSubscriptionsByBacker(backerAddress: string): Promise<RecurringContributionSubscription[]> {
    const list: RecurringContributionSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.backerAddress.toLowerCase() === backerAddress.toLowerCase()) {
        list.push({ ...sub });
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async listSubscriptionsByCreator(creatorAddress: string): Promise<RecurringContributionSubscription[]> {
    const list: RecurringContributionSubscription[] = [];
    for (const sub of this.subscriptions.values()) {
      if (sub.creatorAddress.toLowerCase() === creatorAddress.toLowerCase()) {
        list.push({ ...sub });
      }
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateSubscription(
    id: string,
    updates: Partial<RecurringContributionSubscription>
  ): Promise<RecurringContributionSubscription | null> {
    const existing = this.subscriptions.get(id);
    if (!existing) return null;
    const updated: RecurringContributionSubscription = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    this.subscriptions.set(id, updated);
    return { ...updated };
  }

  clear(): void {
    this.subscriptions.clear();
  }
}

let defaultDataSource: RecurringContributionDataSource = new InMemoryRecurringContributionDataSource();

export function getRecurringContributionDataSource(): RecurringContributionDataSource {
  return defaultDataSource;
}

export function setRecurringContributionDataSource(dataSource: RecurringContributionDataSource): void {
  defaultDataSource = dataSource;
}

export class RecurringContributionService {
  constructor(private dataSourceProvider: () => RecurringContributionDataSource = getRecurringContributionDataSource) {}

  private get ds(): RecurringContributionDataSource {
    return this.dataSourceProvider();
  }

  async createSubscription(input: CreateRecurringSubscriptionInput): Promise<RecurringContributionSubscription> {
    const now = Date.now();
    const startAt = input.startAt ?? now;
    const numAmount = typeof input.amount === 'string' ? parseFloat(input.amount) : input.amount;
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Contribution amount must be a positive number');
    }

    if (!input.backerAddress || !input.campaignId || !input.creatorAddress) {
      throw new Error('backerAddress, campaignId, and creatorAddress are required');
    }

    const nextChargeAt = addCalendarMonthsUtc(startAt, 1);
    const formattedAmount = numAmount.toString();

    const subscription: RecurringContributionSubscription = {
      id: `sub_${now}_${Math.random().toString(36).substring(2, 9)}`,
      campaignId: input.campaignId,
      campaignTitle: input.campaignTitle || `Campaign #${input.campaignId}`,
      creatorAddress: input.creatorAddress,
      backerAddress: input.backerAddress,
      backerName: input.backerName,
      backerEmail: input.backerEmail,
      amount: formattedAmount,
      token: input.token || 'XLM',
      frequency: 'MONTHLY',
      cadence: 'monthly',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      nextChargeAt,
      lastChargedAt: startAt,
      totalChargedAmount: formattedAmount,
      successfulCyclesCount: 1,
    };

    return this.ds.createSubscription(subscription);
  }

  async getSubscription(id: string): Promise<RecurringContributionSubscription | null> {
    return this.ds.getSubscription(id);
  }

  async listSubscriptionsByBacker(backerAddress: string): Promise<RecurringContributionSubscription[]> {
    if (!backerAddress) return [];
    return this.ds.listSubscriptionsByBacker(backerAddress);
  }

  async listSubscriptionsByCreator(creatorAddress: string): Promise<RecurringContributionSubscription[]> {
    if (!creatorAddress) return [];
    return this.ds.listSubscriptionsByCreator(creatorAddress);
  }

  async pauseSubscription(id: string): Promise<RecurringContributionSubscription> {
    const existing = await this.ds.getSubscription(id);
    if (!existing) {
      throw new Error(`Subscription with ID ${id} not found`);
    }
    if (existing.status === 'CANCELLED') {
      throw new Error('Cannot pause a cancelled subscription');
    }
    const updated = await this.ds.updateSubscription(id, {
      status: 'PAUSED',
      pausedAt: Date.now(),
    });
    return updated!;
  }

  async resumeSubscription(id: string): Promise<RecurringContributionSubscription> {
    const existing = await this.ds.getSubscription(id);
    if (!existing) {
      throw new Error(`Subscription with ID ${id} not found`);
    }
    if (existing.status === 'CANCELLED') {
      throw new Error('Cannot resume a cancelled subscription');
    }
    const now = Date.now();
    const nextCharge = addCalendarMonthsUtc(now, 1);
    const updated = await this.ds.updateSubscription(id, {
      status: 'ACTIVE',
      nextChargeAt: nextCharge,
    });
    return updated!;
  }

  async cancelSubscription(id: string, reason?: string): Promise<RecurringContributionSubscription> {
    const existing = await this.ds.getSubscription(id);
    if (!existing) {
      throw new Error(`Subscription with ID ${id} not found`);
    }
    const updated = await this.ds.updateSubscription(id, {
      status: 'CANCELLED',
      cancelledAt: Date.now(),
      cancellationReason: reason,
    });
    return updated!;
  }

  async updateSubscription(id: string, input: UpdateRecurringSubscriptionInput): Promise<RecurringContributionSubscription> {
    const existing = await this.ds.getSubscription(id);
    if (!existing) {
      throw new Error(`Subscription with ID ${id} not found`);
    }

    const updates: Partial<RecurringContributionSubscription> = {};
    if (input.status) {
      if (input.status === 'PAUSED') {
        return this.pauseSubscription(id);
      } else if (input.status === 'ACTIVE') {
        return this.resumeSubscription(id);
      } else if (input.status === 'CANCELLED') {
        return this.cancelSubscription(id, input.cancellationReason);
      }
    }

    if (input.amount !== undefined) {
      const numAmount = typeof input.amount === 'string' ? parseFloat(input.amount) : input.amount;
      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error('Amount must be a positive number');
      }
      updates.amount = numAmount.toString();
    }

    if (input.cancellationReason) {
      updates.cancellationReason = input.cancellationReason;
    }

    const updated = await this.ds.updateSubscription(id, updates);
    return updated!;
  }

  async getCreatorRecurringRevenueReport(creatorAddress: string): Promise<CreatorRecurringRevenueReport> {
    const subs = await this.ds.listSubscriptionsByCreator(creatorAddress);
    const active = subs.filter((s) => s.status === 'ACTIVE');
    const paused = subs.filter((s) => s.status === 'PAUSED');
    const cancelled = subs.filter((s) => s.status === 'CANCELLED');

    const campaignMap = new Map<string, {
      campaignTitle: string;
      activeCount: number;
      mrr: number;
      lifetimeVolume: number;
      token: string;
    }>();

    let totalMrr = 0;
    let totalLifetime = 0;
    const token = subs[0]?.token || 'USDC';

    for (const sub of subs) {
      const amount = parseFloat(sub.amount) || 0;
      const charged = parseFloat(sub.totalChargedAmount) || 0;
      totalLifetime += charged;

      if (!campaignMap.has(sub.campaignId)) {
        campaignMap.set(sub.campaignId, {
          campaignTitle: sub.campaignTitle || `Campaign #${sub.campaignId}`,
          activeCount: 0,
          mrr: 0,
          lifetimeVolume: 0,
          token: sub.token,
        });
      }

      const item = campaignMap.get(sub.campaignId)!;
      item.lifetimeVolume += charged;

      if (sub.status === 'ACTIVE') {
        totalMrr += amount;
        item.activeCount += 1;
        item.mrr += amount;
      }
    }

    const campaignRevenues: CreatorRecurringCampaignRevenue[] = Array.from(campaignMap.entries()).map(
      ([campaignId, data]) => ({
        campaignId,
        campaignTitle: data.campaignTitle,
        activeSubscribersCount: data.activeCount,
        monthlyRecurringRevenue: data.mrr.toFixed(2),
        annualRecurringRevenue: (data.mrr * 12).toFixed(2),
        totalLifetimeVolume: data.lifetimeVolume.toFixed(2),
        token: data.token,
      })
    );

    return {
      creatorAddress,
      generatedAt: Date.now(),
      activeSubscribersCount: active.length,
      pausedSubscribersCount: paused.length,
      cancelledSubscribersCount: cancelled.length,
      totalMonthlyRecurringRevenue: totalMrr.toFixed(2),
      totalAnnualRecurringRevenue: (totalMrr * 12).toFixed(2),
      totalLifetimeVolume: totalLifetime.toFixed(2),
      token,
      campaigns: campaignRevenues,
    };
  }
}

export const recurringContributionService = new RecurringContributionService();
