import { NextRequest, NextResponse } from 'next/server';
import { fraudDetectionService } from '@/services/fraud-detection.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    let report = await fraudDetectionService.getFraudReport(campaignId);

    if (!report) {
      // Run default baseline scan
      report = await fraudDetectionService.analyzeCampaign({ campaignId });
    }

    const securityStatus = await fraudDetectionService.getSecurityStatus(campaignId);

    return NextResponse.json({ success: true, report, securityStatus });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch fraud check report' },
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
    const { campaignTitle, creatorAddress, backers, transactions } = body;

    const report = await fraudDetectionService.analyzeCampaign({
      campaignId,
      campaignTitle,
      creatorAddress,
      backers,
      transactions,
    });

    const securityStatus = await fraudDetectionService.getSecurityStatus(campaignId);

    return NextResponse.json({ success: true, report, securityStatus });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to run fraud detection scan' },
      { status: 400 }
    );
  }
}
