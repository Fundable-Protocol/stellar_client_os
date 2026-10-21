export type CampaignMilestone = 
  | 'trees planted'
  | 'verification complete'
  | 'campaign finished'
  | 'impact achieved'
  | string;

export interface SendPushNotificationOptions {
  userId?: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class PushNotificationService {
  /**
   * Mock implementation of a push notification service.
   * In a real environment, this would use web-push, Firebase Cloud Messaging, OneSignal, etc.
   */
  async sendPushNotification(options: SendPushNotificationOptions): Promise<boolean> {
    console.log(`[PushNotificationService] Sending push notification to user: ${options.userId || 'broadcast'}`);
    console.log(`[PushNotificationService] Title: ${options.title}`);
    console.log(`[PushNotificationService] Body: ${options.body}`);
    
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 100));
    
    console.log(`[PushNotificationService] Push notification sent successfully.`);
    return true;
  }

  async notifyMilestone(campaignId: string, campaignName: string, milestone: CampaignMilestone, userId?: string): Promise<void> {
    await this.sendPushNotification({
      userId,
      title: `Milestone Reached!`,
      body: `Sponsored campaign "${campaignName}" has reached a new milestone: ${milestone}`,
      data: { milestone, campaignId, campaignName }
    });
  }

  async sendCampaignMilestoneNotification(payload: {
    campaignId: string;
    milestonePercentage: number;
    title: string;
    description: string;
    achievedAmount: string;
    targetAmount: string;
  }): Promise<void> {
    await this.sendPushNotification({
      title: `Milestone ${payload.milestonePercentage}% Reached: ${payload.title}`,
      body: payload.description || `Campaign reached ${payload.achievedAmount} / ${payload.targetAmount}`,
      data: payload,
    });
  }

  async notifyBackersVoteRequired(
    campaignId: string,
    campaignName: string,
    milestoneTitle: string,
    backerAddresses: string[],
    votingEndsAt: number
  ): Promise<void> {
    const formattedDeadline = new Date(votingEndsAt).toISOString();
    for (const address of backerAddresses) {
      await this.sendPushNotification({
        userId: address,
        title: `Vote Required: ${campaignName}`,
        body: `Creator submitted milestone completion report for "${milestoneTitle}". Backers have 72 hours to vote.`,
        data: { campaignId, campaignName, milestoneTitle, votingEndsAt: formattedDeadline, type: 'milestone_vote_required' },
      });
    }
  }

  async notifyMilestoneFundsReleased(
    campaignId: string,
    campaignName: string,
    milestoneTitle: string,
    amount: string,
    recipient: string
  ): Promise<void> {
    await this.sendPushNotification({
      userId: recipient,
      title: `Funds Released: ${campaignName}`,
      body: `Tranche funds of ${amount} have been released for milestone "${milestoneTitle}".`,
      data: { campaignId, campaignName, milestoneTitle, amount, type: 'milestone_funds_released' },
    });
  }
}

export const pushNotificationService = new PushNotificationService();
