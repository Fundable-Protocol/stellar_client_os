import { NextRequest, NextResponse } from 'next/server';
import { campaignVotingService } from '@/services/campaign-voting.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const polls = await campaignVotingService.getPollsForCampaign(campaignId);
    return NextResponse.json({ success: true, polls });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch polls' },
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
    const { updateId, title, description, options, durationDays, backerOnly, creatorAddress } = body;

    if (!creatorAddress) {
      return NextResponse.json(
        { success: false, error: 'creatorAddress is required' },
        { status: 400 }
      );
    }

    const poll = await campaignVotingService.createPoll(
      {
        campaignId,
        updateId: updateId || `update-${Date.now()}`,
        title,
        description,
        options,
        durationDays,
        backerOnly,
      },
      creatorAddress
    );

    return NextResponse.json({ success: true, poll }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create poll' },
      { status: 400 }
    );
  }
}
