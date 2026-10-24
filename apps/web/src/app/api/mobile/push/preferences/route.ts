import { NextRequest, NextResponse } from 'next/server';
import { CampaignPushNotificationService } from '@/services/campaign-push-notification.service';
import type { CampaignPushEventType } from '@/types/campaign-notification';

const pushService = new CampaignPushNotificationService();

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscriberAddress, campaignId = '*', enabledMilestones } = body;
    const validEvents: CampaignPushEventType[] = [
      'trees_planted',
      'verification_complete',
      'campaign_finished',
      'impact_achieved',
      'campaign_update',
    ];

    if (
      typeof subscriberAddress !== 'string' ||
      !subscriberAddress ||
      typeof campaignId !== 'string' ||
      !Array.isArray(enabledMilestones) ||
      enabledMilestones.some((event) => !validEvents.includes(event))
    ) {
      return NextResponse.json(
        { error: 'subscriberAddress and a valid enabledMilestones array are required' },
        { status: 400 }
      );
    }

    const updated = await pushService.updatePreferences(
      subscriberAddress,
      campaignId,
      enabledMilestones as CampaignPushEventType[]
    );

    return NextResponse.json({ success: true, updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update preferences';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
