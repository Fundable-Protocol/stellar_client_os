import { BillingCadence } from '@/lib/subscription-cadence';

export type ContributionFrequency = 'ONE_TIME' | 'MONTHLY';

export type RecurringSubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface RecurringContributionSubscription {
  id: string;
  campaignId: string;
  campaignTitle?: string;
  creatorAddress: string;
  backerAddress: string;
  backerName?: string;
  backerEmail?: string;
  amount: string; // token units e.g. "25"
  token: string;  // e.g. "USDC" | "XLM"
  frequency: 'MONTHLY';
  cadence: BillingCadence;
  status: RecurringSubscriptionStatus;
  createdAt: number;
  updatedAt: number;
  nextChargeAt: number;
  lastChargedAt?: number;
  totalChargedAmount: string;
  successfulCyclesCount: number;
  cancelledAt?: number;
  cancellationReason?: string;
  pausedAt?: number;
}

export interface CreateRecurringSubscriptionInput {
  campaignId: string;
  campaignTitle?: string;
  creatorAddress: string;
  backerAddress: string;
  backerName?: string;
  backerEmail?: string;
  amount: string | number;
  token?: string;
  startAt?: number;
}

export interface UpdateRecurringSubscriptionInput {
  status?: RecurringSubscriptionStatus;
  amount?: string | number;
  cancellationReason?: string;
}

export interface CreatorRecurringCampaignRevenue {
  campaignId: string;
  campaignTitle: string;
  activeSubscribersCount: number;
  monthlyRecurringRevenue: string; // formatted e.g. "150.00"
  annualRecurringRevenue: string;
  totalLifetimeVolume: string;
  token: string;
}

export interface CreatorRecurringRevenueReport {
  creatorAddress: string;
  generatedAt: number;
  activeSubscribersCount: number;
  pausedSubscribersCount: number;
  cancelledSubscribersCount: number;
  totalMonthlyRecurringRevenue: string; // sum of MRR
  totalAnnualRecurringRevenue: string;
  totalLifetimeVolume: string;
  token: string;
  campaigns: CreatorRecurringCampaignRevenue[];
}
