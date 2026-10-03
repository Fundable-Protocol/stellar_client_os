import { NextRequest, NextResponse } from 'next/server';
import { CampaignPushNotificationService } from '@/services/campaign-push-notification.service';
import type { CampaignMilestoneType } from '@/types/campaign-notification';

const pushService = new CampaignPushNotificationService();

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { subscriberAddress, campaignId = '*', enabledMilestones } = body;

    if (!subscriberAddress || !Array.isArray(enabledMilestones)) {
      return NextResponse.json(
        { error: 'subscriberAddress and enabledMilestones array are required' },
        { status: 400 }
      );
    }

    const updated = await pushService.updatePreferences(
      subscriberAddress,
      campaignId,
      enabledMilestones as CampaignMilestoneType[]
    );

    return NextResponse.json({ success: true, updated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update preferences';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
