import { NextRequest, NextResponse } from 'next/server';
import { campaignVotingService } from '@/services/campaign-voting.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; pollId: string } }
) {
  try {
    const { pollId } = params;
    const body = await request.json();
    const { creatorAddress } = body;

    if (!creatorAddress) {
      return NextResponse.json(
        { success: false, error: 'creatorAddress is required to close poll' },
        { status: 400 }
      );
    }

    const poll = await campaignVotingService.closePoll(pollId, creatorAddress);
    const results = await campaignVotingService.getPollResults(pollId);

    return NextResponse.json({ success: true, poll, results });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to close poll' },
      { status: 400 }
    );
  }
}
