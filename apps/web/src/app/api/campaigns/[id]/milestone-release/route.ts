export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { campaignMilestoneReleaseService } from '@/services/campaign-milestone-release.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: campaignId } = await Promise.resolve(params);
    const tranches = await campaignMilestoneReleaseService.getTranches(campaignId);

    // Compute voting summary for each tranche
    const summaries = await Promise.all(
      tranches.map((t) =>
        campaignMilestoneReleaseService.getVotingSummary(campaignId, t.id)
      )
    );

    return NextResponse.json({
      success: true,
      campaignId,
      tranches,
      summaries,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch milestone tranches' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id: campaignId } = await Promise.resolve(params);
    const body = await request.json();
    const { totalAmount, tranches } = body;

    const initialized = campaignMilestoneReleaseService.initializeTranches({
      campaignId,
      totalAmount,
      tranches,
    });

    return NextResponse.json(
      { success: true, tranches: initialized },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to initialize milestone tranches' },
      { status: 400 }
    );
  }
}
