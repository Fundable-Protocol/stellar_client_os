export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { campaignMilestoneReleaseService } from '@/services/campaign-milestone-release.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: campaignId } = await Promise.resolve(params);
    const body = await request.json();
    const { milestoneId, creatorAddress, summary, evidenceUrls, deliverables } = body;

    if (!milestoneId || !creatorAddress || !summary) {
      return NextResponse.json(
        {
          success: false,
          error: 'milestoneId, creatorAddress, and summary are required to submit a completion report.',
        },
        { status: 400 }
      );
    }

    const updatedTranche = await campaignMilestoneReleaseService.submitCompletionReport({
      campaignId,
      milestoneId,
      creatorAddress,
      summary,
      evidenceUrls,
      deliverables,
    });

    const summaryData = await campaignMilestoneReleaseService.getVotingSummary(
      campaignId,
      milestoneId
    );

    return NextResponse.json(
      {
        success: true,
        message: 'Milestone completion report submitted. Backers notified and 72-hour voting window is open.',
        tranche: updatedTranche,
        votingSummary: summaryData,
      },
      { status: 201 }
    );
  } catch (error: any) {
    const isAuth = error.message?.includes('Unauthorized');
    const isState = error.message?.includes('not closed') || error.message?.includes('prior Milestone');
    const status = isAuth ? 403 : isState ? 409 : 400;

    return NextResponse.json(
      { success: false, error: error.message || 'Failed to submit milestone completion report' },
      { status }
    );
  }
}
