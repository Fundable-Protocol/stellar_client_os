import { NextRequest, NextResponse } from 'next/server';
import { fraudDetectionService } from '@/services/fraud-detection.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const body = await request.json();
    const { reason } = body;

    const securityStatus = await fraudDetectionService.suspendCampaign(
      campaignId,
      reason || 'Campaign suspended due to fraud risk flags.'
    );

    return NextResponse.json({ success: true, securityStatus });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to suspend campaign' },
      { status: 400 }
    );
  }
}
