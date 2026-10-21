export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { campaignMilestoneReleaseService } from '@/services/campaign-milestone-release.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> | { id: string; milestoneId: string } }
) {
  try {
    const { id: campaignId, milestoneId } = await Promise.resolve(params);
    const body = await request.json();
    const { voterAddress, approve, comment } = body;

    if (!voterAddress || typeof approve !== 'boolean') {
      return NextResponse.json(
        {
          success: false,
          error: 'voterAddress and approve (boolean) are required to cast a vote.',
        },
        { status: 400 }
      );
    }

    const result = await campaignMilestoneReleaseService.castVote({
      campaignId,
      milestoneId,
      voterAddress,
      approve,
      comment,
    });

    const summary = await campaignMilestoneReleaseService.getVotingSummary(
      campaignId,
      milestoneId
    );

    return NextResponse.json({
      success: true,
      vote: result.vote,
      tranche: result.tranche,
      released: result.released,
      votingSummary: summary,
    });
  } catch (error: any) {
    const isAuth = error.message?.includes('Unauthorized');
    const isLapsed = error.message?.includes('lapsed') || error.message?.includes('already released');
    const status = isAuth ? 403 : isLapsed ? 410 : 400;

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to cast vote' },
      { status }
    );
  }
}
