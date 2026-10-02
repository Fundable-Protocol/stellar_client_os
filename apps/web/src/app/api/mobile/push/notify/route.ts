import { NextRequest, NextResponse } from 'next/server';
import { CampaignPushNotificationService } from '@/services/campaign-push-notification.service';
import type { CampaignMilestoneType } from '@/types/campaign-notification';

const pushService = new CampaignPushNotificationService();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { campaignId, campaignTitle, milestone, details = {}, deepLinkUrl } = body;

    const validMilestones: CampaignMilestoneType[] = [
      'trees_planted',
      'verification_complete',
      'campaign_finished',
      'impact_achieved',
    ];

    if (!campaignId || !milestone || !validMilestones.includes(milestone)) {
      return NextResponse.json(
        {
          error: `campaignId and a valid milestone (${validMilestones.join(', ')}) are required`,
        },
        { status: 400 }
      );
    }

    const result = await pushService.sendMilestonePushNotification({
      campaignId: String(campaignId),
      campaignTitle: campaignTitle || `Campaign #${campaignId}`,
      milestone,
      details,
      deepLinkUrl,
    });

    return NextResponse.json({
      success: true,
      sentCount: result.sentCount,
      errors: result.errors,
      delivered: result.delivered,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to dispatch milestone notification';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
