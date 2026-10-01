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
}

export const pushNotificationService = new PushNotificationService();
