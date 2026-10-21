export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { campaignMilestoneReleaseService } from '@/services/campaign-milestone-release.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; milestoneId: string }> | { id: string; milestoneId: string } }
) {
  try {
    const { id: campaignId, milestoneId } = await Promise.resolve(params);
    let callerAddress: string | undefined;

    try {
      const body = await request.json();
      callerAddress = body.callerAddress;
    } catch {
      // Body is optional
    }

    const result = await campaignMilestoneReleaseService.evaluateAndTriggerRelease({
      campaignId,
      milestoneId,
      callerAddress,
    });

    const summary = await campaignMilestoneReleaseService.getVotingSummary(
      campaignId,
      milestoneId
    );

    if (!result.ok) {
      return NextResponse.json(
        {
          success: false,
          released: false,
          message: result.message,
          votingSummary: summary,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      released: true,
      message: result.message,
      releaseReason: result.releaseReason,
      tranche: result.tranche,
      votingSummary: summary,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to trigger milestone release' },
      { status: 400 }
    );
  }
}
