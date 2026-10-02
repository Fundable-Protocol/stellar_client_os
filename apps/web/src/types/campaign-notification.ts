export type CampaignMilestoneType =
  | 'trees_planted'
  | 'verification_complete'
  | 'campaign_finished'
  | 'impact_achieved';

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export type DeviceType = 'mobile_ios' | 'mobile_android' | 'mobile_web' | 'unknown';

export interface CampaignPushSubscription {
  id: string;
  subscriberAddress: string;
  campaignId: string; // specific campaign ID or '*' for all sponsored campaigns
  endpoint: string;
  keys: PushSubscriptionKeys;
  deviceType: DeviceType;
  enabledMilestones: CampaignMilestoneType[];
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneNotificationPayload {
  campaignId: string;
  campaignTitle: string;
  milestone: CampaignMilestoneType;
  details: {
    treesPlanted?: number;
    targetTrees?: number;
    impactDescription?: string;
    verifierAddress?: string;
    completionTimestamp?: number;
    [key: string]: unknown;
  };
  deepLinkUrl?: string;
}

export interface DeliveredPushNotification {
  id: string;
  subscriptionId: string;
  subscriberAddress: string;
  campaignId: string;
  milestone: CampaignMilestoneType;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sentAt: string;
  status: 'sent' | 'failed';
  errorMessage?: string;
}
