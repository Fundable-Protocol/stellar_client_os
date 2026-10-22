/**
 * Campaign Pre-Launch & Waitlist Types — Issue #1358
 *
 * Types for campaign teaser landing pages, pre-launch subscriber waitlists,
 * real-time social proof metrics, and automated launch broadcast notifications.
 */

export interface PreLaunchSubscriber {
  id: string;
  campaignId: string;
  email: string;
  walletAddress?: string;
  subscribedAt: number;
  notifiedAt?: number;
  active: boolean;
}

export interface PreLaunchStats {
  campaignId: string;
  subscriberCount: number;
  targetSubscribers: number;
  progressPercent: number;
  weeklyGrowth: number;
  isPreLaunch: boolean;
  expectedLaunchDate?: string;
}

export interface PreLaunchSubscriptionInput {
  campaignId: string;
  email: string;
  walletAddress?: string;
}

export interface PreLaunchTransitionResult {
  success: boolean;
  campaignId: string;
  previousStatus: string;
  newStatus: string;
  broadcastCount: number;
  emailsSent: number;
  pushNotificationsSent: number;
  transitionedAt: number;
}
