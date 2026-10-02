import { NextRequest, NextResponse } from 'next/server';
import { campaignVotingService } from '@/services/campaign-voting.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; pollId: string } }
) {
  try {
    const { id: campaignId, pollId } = params;
    const body = await request.json();
    const { voterAddress, optionId } = body;

    if (!voterAddress || !optionId) {
      return NextResponse.json(
        { success: false, error: 'voterAddress and optionId are required' },
        { status: 400 }
      );
    }

    const vote = await campaignVotingService.castVote({
      pollId,
      campaignId,
      voterAddress,
      optionId,
    });

    const updatedPoll = await campaignVotingService.getPollById(pollId);

    return NextResponse.json({ success: true, vote, poll: updatedPoll });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to cast vote' },
      { status: 400 }
    );
  }
}
