import { NextRequest, NextResponse } from 'next/server';
import { onChainCampaignTrackingService } from '@/services/onchain-campaign-tracking.service';
import { pushNotificationService } from '@/services/push-notification.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const milestones = await onChainCampaignTrackingService.getOnChainMilestones(campaignId);
    return NextResponse.json({ success: true, milestones });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch on-chain milestones' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const body = await request.json();
    const { milestonePercentage, title, description, achievedAmount, targetAmount } = body;

    if (!milestonePercentage || !title) {
      return NextResponse.json(
        { success: false, error: 'milestonePercentage and title are required' },
        { status: 400 }
      );
    }

    const milestone = await onChainCampaignTrackingService.recordOnChainMilestone({
      campaignId,
      milestonePercentage: Number(milestonePercentage),
      title,
      description: description || '',
      achievedAmount: achievedAmount || '0',
      targetAmount: targetAmount || '0',
    });

    try {
      await pushNotificationService.sendCampaignMilestoneNotification({
        campaignId,
        milestonePercentage: Number(milestonePercentage),
        title,
        description: description || '',
        achievedAmount: achievedAmount || '0',
        targetAmount: targetAmount || '0',
      });
    } catch (notificationError) {
      console.error(
        'Failed to send campaign milestone push notification',
        notificationError
      );
    }

    return NextResponse.json({ success: true, milestone }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to record milestone on-chain' },
      { status: 400 }
    );
  }
}
